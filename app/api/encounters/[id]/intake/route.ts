import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchProfileFields, fetchUserRole } from '@/lib/fetch-user-role'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import { loadIntakeForEncounter } from '@/lib/encounters/load-intake-for-encounter'
import { loadIntakePrefillForPatient } from '@/lib/intake/load-intake-prefill'
import { intakeLastAuditFromRow, saveEncounterIntake } from '@/lib/intake/save-encounter-intake'
import { canEditClinicalEncounterContent, mapRoleToEnum } from '@/lib/roles'
import { nurseWalkInIntakeSchema } from '@/lib/validation'
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

    const admin = await guardEncounterAccess(user.id, encounterId)

    auditPhi({
      user,
      action: 'encounter_viewed',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'intake' },
      request,
    })

    const { data: encounter, error: encError } = await admin
      .from('encounters')
      .select('id, appointment_id, intake_id, patient_id')
      .eq('id', encounterId)
      .maybeSingle()
    if (encError) throw encError
    if (!encounter) throw new ValidationError('Encounter not found')

    const appointmentId =
      encounter.appointment_id != null && Number.isFinite(Number(encounter.appointment_id))
        ? Number(encounter.appointment_id)
        : null
    const intakeId =
      encounter.intake_id != null && Number.isFinite(Number(encounter.intake_id))
        ? Number(encounter.intake_id)
        : null

    const intake = await loadIntakeForEncounter(admin, intakeId, appointmentId)
    if (intake) {
      return NextResponse.json({ data: intake, prefill: null, last_audit: intakeLastAuditFromRow(intake) })
    }

    const patientId =
      encounter.patient_id != null && Number.isFinite(Number(encounter.patient_id))
        ? Number(encounter.patient_id)
        : null
    const prefill =
      patientId != null ? await loadIntakePrefillForPatient(admin, patientId, appointmentId) : null

    return NextResponse.json({ data: null, prefill })
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
    const mappedRole = mapRoleToEnum(roleInfo?.role ?? '')
    if (!mappedRole || !canEditClinicalEncounterContent(mappedRole)) {
      throw new AuthorizationError()
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = nurseWalkInIntakeSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = await guardEncounterAccess(user.id, encounterId, {
      requireDoctorAssignment: false,
    })

    const profile = await fetchProfileFields(supabase, user.id, 'full_name, email', {
      email: user.email,
    })
    const editorName =
      (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
      (typeof profile?.email === 'string' && profile.email) ||
      user.email ||
      'Unknown'

    const intake = await saveEncounterIntake(admin, encounterId, parsed.data, {
      userId: user.id,
      role: mappedRole,
      editorName,
    })

    auditPhi({
      user,
      role: mappedRole,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'intake' },
      request,
    })

    return NextResponse.json({
      data: intake,
      last_audit: intakeLastAuditFromRow(intake),
    })
  } catch (e) {
    return handleApiError(e)
  }
}
