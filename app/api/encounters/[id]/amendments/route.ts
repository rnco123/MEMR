import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { amendmentNoteSaveSchema } from '@/lib/validation'
import {
  assertSoapViewerRole,
  assertClinicalSoapRole,
} from '@/lib/soap/encounter-doctor-soap'
import {
  canAmendEncounterSoap,
  createAmendmentNote,
  loadAmendmentNotesForEncounter,
} from '@/lib/soap/amendment-notes'
import { assertEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/assert-access'
import { resolveEncounterWriteAllowed } from '@/lib/encounters/access-helpers'
import { getDoctorRowId } from '@/lib/clinical'
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

    const { data: encounter, error: encErr } = await admin
      .from('encounters')
      .select('id, status, doctor_id')
      .eq('id', encounterId)
      .maybeSingle()
    if (encErr) throw encErr
    if (!encounter) throw new ValidationError('Encounter not found')

    const { data: doctorSoap } = await admin
      .from('doctor_soapnotes')
      .select('id')
      .eq('encounter_id', encounterId)
      .maybeSingle()

    const amendments = await loadAmendmentNotesForEncounter(admin, encounterId)
    const mappedRole = mapRoleToEnum(roleInfo?.role)
    const canWrite =
      mappedRole != null
        ? await resolveEncounterWriteAllowed(admin, user.id, mappedRole, encounter)
        : false

    const selfDoctorId = await getDoctorRowId(admin, user.id)
    const assignedDoctorId =
      encounter.doctor_id != null && Number.isFinite(Number(encounter.doctor_id))
        ? Number(encounter.doctor_id)
        : null
    const isAssignedDoctor =
      selfDoctorId != null && (assignedDoctorId == null || assignedDoctorId === selfDoctorId)

    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'encounter_viewed',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'amendments' },
      request,
    })

    return NextResponse.json({
      amendments,
      can_amend:
        canWrite &&
        canAmendEncounterSoap(encounter.status as string, roleInfo?.role) &&
        Boolean(doctorSoap?.id) &&
        isAssignedDoctor,
      encounter_status: encounter.status,
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
    if (!canAmendEncounterSoap('completed', role)) {
      throw new ValidationError('Only doctors can add amendment notes after completion')
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = amendmentNoteSaveSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId, ENCOUNTER_WRITE_ACCESS)

    const amendment = await createAmendmentNote(admin, {
      encounterId,
      userId: user.id,
      userEmail: user.email,
      role: role!,
      payload: parsed.data,
    })

    auditPhi({
      user,
      role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'amendment', amendment_id: amendment.id },
      request,
    })

    return NextResponse.json({ amendment }, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
