import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canJoinTelemedicine } from '@/lib/encounter-status'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { config } from '@/lib/config'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { resolveClinicalApiRole } from '@/lib/locations/scope'
import { UserRole, isPhysicianRole } from '@/lib/roles'
import { auditPhi } from '@/lib/audit-phi'
import { vonlinkageFetch, toVonLinkageRole, type VonLinkageRoom } from '@/lib/vonlinkage'

export const dynamic = 'force-dynamic'

async function getUserFromRequest(request: Request): Promise<{ user: { id: string } } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return { user }
  }

  const supabaseServer = await createServerClient()
  const { data: { user }, error } = await supabaseServer.auth.getUser()
  if (error || !user) return null
  return { user }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getUserFromRequest(request)
    const user = authResult?.user ?? null

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      body = {}
    }
    const { encounterId } = body

    if (encounterId == null) {
      return NextResponse.json(
        { error: 'encounterId is required for telemedicine' },
        { status: 400 }
      )
    }

    const encounterIdNum = Number(encounterId)
    if (Number.isNaN(encounterIdNum)) {
      return NextResponse.json({ error: 'Invalid encounter ID' }, { status: 400 })
    }

    const roleInfo = await fetchUserRole(await createServerClient(), user.id)
    const clinicalRole = resolveClinicalApiRole(roleInfo?.role)
    if (!isPhysicianRole(clinicalRole) && clinicalRole !== UserRole.NURSE) {
      return NextResponse.json(
        { error: 'Only physicians and nurses can join telemedicine' },
        { status: 403 }
      )
    }

    await guardEncounterAccess(user.id, encounterIdNum, {
      requireDoctorAssignment: isPhysicianRole(clinicalRole),
    })

    const supabase = createAdminClient()

    const { data: encounter, error: encounterError } = await supabase
      .from('encounters')
      .select('id, status')
      .eq('id', encounterIdNum)
      .single()

    if (encounterError || !encounter) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }

    if (!canJoinTelemedicine(encounter.status)) {
      return NextResponse.json(
        { error: 'Vitals must be assessed before joining telemedicine' },
        { status: 403 }
      )
    }

    const roomName = `encounter-${encounterId}`

    const roomResult = await vonlinkageFetch<VonLinkageRoom>('/rooms', {
      method: 'POST',
      body: { roomName },
    })

    if (!roomResult.ok || !roomResult.data) {
      return NextResponse.json(
        { error: roomResult.error?.message ?? 'Failed to create VonLinkage room' },
        { status: roomResult.status || 502 }
      )
    }

    if (encounterId != null) {
      try {
        await supabase
          .from('encounters')
          .update({ status: 'in_consultation', updated_at: new Date().toISOString() })
          .eq('id', encounterIdNum)
        const profileId = await getProfileId(supabase, user.id)
        await insertStatusTimeline(supabase, {
          encounterId: encounterIdNum,
          status: 'in_consultation',
          profileId,
        })
      } catch (updateError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error updating encounter status to in_consultation:', updateError)
        }
      }
    }

    let profileForToken: { full_name?: string | null; role?: string } | null = null
    const profileById = await supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
    if (profileById.data) profileForToken = profileById.data
    if (!profileForToken) {
      const profileByUid = await supabase.from('profiles').select('full_name, role').eq('uid', user.id).maybeSingle()
      if (profileByUid.data) profileForToken = profileByUid.data
    }

    const userRole = (profileForToken?.role as string) ?? ''
    const displayName = isPhysicianRole(userRole)
      ? 'Doctor'
      : userRole === 'nurse' || userRole === 'staff'
        ? 'Nurse'
        : 'Staff'
    const userName = profileForToken?.full_name || displayName

    const tokenResult = await vonlinkageFetch<{ token: string }>(
      `/rooms/${encodeURIComponent(roomName)}/token`,
      {
        method: 'POST',
        body: {
          identity: user.id,
          role: toVonLinkageRole(isPhysicianRole(userRole)),
          name: userName,
        },
      }
    )

    if (!tokenResult.ok || !tokenResult.data?.token) {
      return NextResponse.json(
        { error: tokenResult.error?.message ?? 'Could not get join token. Please try again.' },
        { status: tokenResult.status || 502 }
      )
    }

    // Patient never logs into MEMR, so their credential rides entirely in the link
    // (same trust model Daily's hosted room URL had): a fresh single-use-feeling token
    // scoped to this room, embedded in a URL to MEMR's own public join page.
    let patientJoinUrl: string | null = null
    const patientTokenResult = await vonlinkageFetch<{ token: string }>(
      `/rooms/${encodeURIComponent(roomName)}/token`,
      {
        method: 'POST',
        body: { identity: `patient-${encounterId}`, role: 'patient', name: 'Patient' },
      }
    )
    if (patientTokenResult.ok && patientTokenResult.data?.token) {
      const origin = new URL(request.url).origin
      const params = new URLSearchParams({
        url: roomResult.data.joinUrl,
        t: patientTokenResult.data.token,
      })
      patientJoinUrl = `${origin}/join/${encodeURIComponent(roomName)}?${params.toString()}`
    }

    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'video_session_started',
      resourceType: 'encounter',
      resourceId: encounterIdNum,
      request,
    })

    return NextResponse.json({
      roomName: roomResult.data.roomName,
      joinUrl: roomResult.data.joinUrl,
      token: tokenResult.data.token,
      patientJoinUrl,
    })
  } catch (error) {
    console.error('[vonlinkage/room]', error)
    Sentry.captureException(error, { tags: { route: 'vonlinkage-room' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
