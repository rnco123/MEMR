import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
import { guardEncounterAccess } from '@/lib/encounters/guard'
import {
  canPrescribe,
  canViewClinicalEncounterContent,
} from '@/lib/roles'

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

async function requirePrescriber(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const roleInfo = await fetchUserRole(supabase, userId)
  if (!canPrescribe(roleInfo?.role)) {
    throw new AuthorizationError('Only physicians (doctor, FNP, PA) can prescribe')
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

    await requireEncounterViewer(supabase, user.id)
    await guardEncounterAccess(user.id, encounterId)
    await loadEncounterForRx(supabase, encounterId)

    const data = await selectPrescriptionsForEncounter(supabase, encounterId)
    return NextResponse.json({ data })
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

    await requirePrescriber(supabase, user.id)
    await guardEncounterAccess(user.id, encounterId)

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

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
