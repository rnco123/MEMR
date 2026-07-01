import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encounterPrescriptionCreateSchema } from '@/lib/validation'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  assertEncounterRxEditable,
  insertPrescriptionRow,
  loadEncounterForRx,
  resolvePrescriberDoctorId,
  selectPrescriptionsForEncounter,
} from '@/lib/prescriptions/encounter-prescriptions'
import { guardEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/guard'
import {
  canEditEncounterPrescriptionsByRole,
  canViewClinicalEncounterContent,
} from '@/lib/roles'
import { logPrescriptionAudit, loadLatestPrescriptionAuditForEncounter } from '@/lib/prescriptions/prescription-audit'
import {
  assertEncounterPrescriptionsEditable,
  isEncounterPrescriptionsReleased,
  listPrescriptionReadyForEncounter,
} from '@/lib/prescriptions/prescription-ready'

export const dynamic = 'force-dynamic'

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

async function requireEncounterViewer(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const roleInfo = await fetchUserRole(supabase, userId)
  if (!canViewClinicalEncounterContent(roleInfo?.role)) {
    throw new AuthorizationError('Clinical staff only')
  }
  return roleInfo!.role!
}

async function requireEncounterRxEditor(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const roleInfo = await fetchUserRole(supabase, userId)
  if (!canEditEncounterPrescriptionsByRole(roleInfo?.role)) {
    throw new AuthorizationError()
  }
  return roleInfo!.role!
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    await requireEncounterViewer(supabase, user.id)
    await guardEncounterAccess(user.id, encounterId)
    await loadEncounterForRx(supabase, encounterId)

    const data = await selectPrescriptionsForEncounter(supabase, encounterId)
    const admin = createAdminClient()
    const [last_audit, released] = await Promise.all([
      loadLatestPrescriptionAuditForEncounter(admin, encounterId),
      isEncounterPrescriptionsReleased(admin, encounterId),
    ])

    const payload: Record<string, unknown> = { data, last_audit, released }
    if (roleInfo?.role === 'admin') {
      payload.ready_queue = await listPrescriptionReadyForEncounter(admin, encounterId)
    }

    return NextResponse.json(payload)
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

    const role = await requireEncounterRxEditor(supabase, user.id)
    await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = encounterPrescriptionCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const encounter = await loadEncounterForRx(supabase, encounterId)
    assertEncounterRxEditable(encounter)

    const admin = createAdminClient()
    await assertEncounterPrescriptionsEditable(admin, encounterId)

    const prescriberDoctorId = await resolvePrescriberDoctorId(
      supabase,
      user.id,
      encounter.doctor_id
    )

    const data = await insertPrescriptionRow(supabase, {
      prescriberDoctorId,
      patientId: encounter.patient_id,
      encounterId,
      pharmacyId: encounter.pharmacy_id,
      ...parsed.data,
    })

    await logPrescriptionAudit(admin, {
      encounterId,
      patientId: encounter.patient_id,
      prescriptionId: data.id,
      action: 'create',
      userId: user.id,
      role,
      userEmail: user.email,
      snapshot: data,
    })

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
