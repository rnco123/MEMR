import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encounterPrescriptionUpdateSchema } from '@/lib/validation'
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  assertEncounterRxEditable,
  loadEncounterForRx,
  selectPrescriptionsForEncounter,
  updatePrescriptionRow,
} from '@/lib/prescriptions/encounter-prescriptions'
import { guardEncounterAccess } from '@/lib/encounters/guard'

export const dynamic = 'force-dynamic'

const CLINICAL_ROLES = new Set(['doctor', 'nurse', 'staff'])

function parseId(raw: string | undefined, label: string): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError(`Invalid ${label}`)
  return id
}

async function requireClinicalUser(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const roleInfo = await fetchUserRole(supabase, userId)
  if (!roleInfo?.role || !CLINICAL_ROLES.has(roleInfo.role)) {
    throw new AuthorizationError('Doctors and nurses only')
  }
}

async function loadPrescription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  encounterId: number,
  rxId: number
) {
  const rows = await selectPrescriptionsForEncounter(supabase, encounterId)
  const hit = rows.find((row) => row.id === rxId)
  if (!hit) throw new NotFoundError('Prescription not found')
  return hit
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; rxId: string } }
) {
  try {
    const encounterId = parseId(params.id, 'encounter id')
    const rxId = parseId(params.rxId, 'prescription id')
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    await requireClinicalUser(supabase, user.id)
    await guardEncounterAccess(user.id, encounterId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = encounterPrescriptionUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error
    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError('No fields to update')
    }

    const encounter = await loadEncounterForRx(supabase, encounterId)
    assertEncounterRxEditable(encounter)

    const existing = await loadPrescription(supabase, encounterId, rxId)
    const v = parsed.data

    const medication_name = v.medication_name ?? existing.medication_name
    const dose =
      (v.dosage_instruction ?? v.instructions ?? v.dosage ?? existing.dosage_instruction ?? existing.instructions ?? existing.dosage ?? '').trim() || null

    const patch: Record<string, unknown> = {
      medication_name,
      updated_at: new Date().toISOString(),
    }

    if (v.strength !== undefined) patch.strength = v.strength?.trim() || null
    if (v.route !== undefined) patch.route = v.route?.trim() || null
    if (v.frequency !== undefined) patch.frequency = v.frequency?.trim() || null
    if (v.duration !== undefined) patch.duration = v.duration?.trim() || null
    if (v.quantity !== undefined) patch.quantity = v.quantity?.trim() || null
    if (v.refills !== undefined) patch.refills = v.refills
    if (v.notes !== undefined) patch.notes = v.notes?.trim() || null
    if (v.dosage !== undefined || v.dosage_instruction !== undefined || v.instructions !== undefined) {
      patch.dosage_instruction = dose
      patch.dosage = dose
      patch.instructions = dose
    }

    if (encounter.pharmacy_id != null) {
      patch.pharmacy_id = encounter.pharmacy_id
    }

    const data = await updatePrescriptionRow(supabase, encounterId, rxId, patch)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; rxId: string } }
) {
  try {
    const encounterId = parseId(params.id, 'encounter id')
    const rxId = parseId(params.rxId, 'prescription id')
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    await requireClinicalUser(supabase, user.id)
    await guardEncounterAccess(user.id, encounterId)

    const encounter = await loadEncounterForRx(supabase, encounterId)
    assertEncounterRxEditable(encounter)
    await loadPrescription(supabase, encounterId, rxId)

    const { data, error } = await supabase
      .from('prescriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', rxId)
      .eq('encounter_id', encounterId)
      .select('id, status')
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
