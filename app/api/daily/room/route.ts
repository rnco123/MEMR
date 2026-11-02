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
import { mintDailyCredentials } from '@/lib/daily/credentials'

export const dynamic = 'force-dynamic'

async function getUserFromRequest(request: Request): Promise<{ user: { id: string } } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return { user }
  }

  // M-04b: Use getUser() for verified server-side auth.
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

    // L-04: Telemedicine requires a specific encounter; nurses cannot join arbitrary rooms.
    if (encounterId == null) {
      return NextResponse.json(
        { error: 'encounterId is required for telemedicine' },
        { status: 400 }
      )
    }

    const encounterIdNum = Number(encounterId)
    if (Number.isNaN(encounterIdNum)) {
      return NextResponse.json(
        { error: 'Invalid encounter ID' },
        { status: 400 }
      )
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
      return NextResponse.json(
        { error: 'Encounter not found' },
        { status: 404 }
      )
    }

    if (!canJoinTelemedicine(encounter.status)) {
      return NextResponse.json(
        { error: 'Vitals must be assessed before joining telemedicine' },
        { status: 403 }
      )
    }

    // Display name and owner flag come from the EMR's own role model. Some
    // profiles key on `id` and some on `uid`, so both are tried.
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

    // Room and token in one call. mcm-bridge owns the room name and properties,
    // so this route and the patient app cannot drift into separate rooms; it
    // falls back to a direct Daily call only when the bridge is unconfigured or
    // unreachable. Authorization has already happened above — this only mints.
    const creds = await mintDailyCredentials({
      encounterId: encounterIdNum,
      userId: user.id,
      userName,
      // Owner can eject participants and start recordings: physicians only.
      isOwner: isPhysicianRole(userRole),
    })

    // If this is tied to an encounter, move status to in_consultation
    if (encounterId != null) {
      try {
        const encounterIdNum = Number(encounterId)
        if (!isNaN(encounterIdNum)) {
          await supabase
            .from('encounters')
            .update({
              status: 'in_consultation',
              updated_at: new Date().toISOString(),
            })
            .eq('id', encounterIdNum)
          const profileId = await getProfileId(supabase, user.id)
          await insertStatusTimeline(supabase, {
            encounterId: encounterIdNum,
            status: 'in_consultation',
            profileId,
          })
        }
      } catch (updateError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error updating encounter status to in_consultation:', updateError)
        }
        // Do not block room creation/return on status update failure
      }
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
      ...(creds.room ?? {}),
      name: creds.roomName,
      token: creds.token, // Include token for SDK usage
      room_url: creds.roomUrl, // Matches the account that created the room
    })
  } catch (error) {
    console.error('[daily/room]', error)
    Sentry.captureException(error, { tags: { route: 'daily-room' } })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
