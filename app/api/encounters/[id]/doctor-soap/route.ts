import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { doctorSoapSaveSchema } from '@/lib/validation'
import {
  assertClinicalSoapRole,
  assertSoapViewerRole,
  loadEncounterSoapContext,
  saveDoctorSoapNote,
} from '@/lib/soap/encounter-doctor-soap'
import { assertEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/assert-access'
import { resolveEncounterWriteAllowed } from '@/lib/encounters/access-helpers'
import { mapRoleToEnum } from '@/lib/roles'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    assertSoapViewerRole(roleInfo?.role)

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId)
    const ctx = await loadEncounterSoapContext(admin, encounterId, undefined, roleInfo?.role)
    const mappedRole = mapRoleToEnum(roleInfo?.role)
    const canWrite =
      mappedRole != null
        ? await resolveEncounterWriteAllowed(admin, user.id, mappedRole, ctx.encounter)
        : false

    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'encounter_viewed',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'soap' },
      request,
    })

    return NextResponse.json({
      ai_soap: ctx.ai_soap,
      doctor_soap: ctx.doctor_soap,
      last_audit: ctx.last_audit,
      editable: canWrite && ctx.editable,
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const role = roleInfo?.role
    assertClinicalSoapRole(role)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = doctorSoapSaveSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId, ENCOUNTER_WRITE_ACCESS)
    const result = await saveDoctorSoapNote(admin, {
      encounterId,
      userId: user.id,
      userEmail: user.email,
      role: role!,
      payload: parsed.data,
      seededFromAi: parsed.data.seeded_from_ai === true,
    })

    auditPhi({
      user,
      role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'soap' },
      request,
    })

    return NextResponse.json({
      success: true,
      doctor_soap: result.doctor_soap,
      last_audit: result.last_audit,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
