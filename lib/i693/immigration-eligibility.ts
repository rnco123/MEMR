import type { SupabaseClient } from '@supabase/supabase-js'
import { IMMIGRATION_PROGRAM } from '@/lib/immigration/types'
import { isImmigrationEncounter } from '@/lib/i693/types'

export function isImmigrationServiceTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false
  return /\bimmigration\b/i.test(title.trim())
}

type AppointmentServiceShape = {
  title_en?: string | null
  title_es?: string | null
} | null

type EncounterImmigrationShape = {
  patient_id?: number | null
  consent_ack?: unknown
  program_type?: string | null
  appointments?:
    | {
        patient_id?: number | null
        services?: AppointmentServiceShape | AppointmentServiceShape[]
      }
    | {
        patient_id?: number | null
        services?: AppointmentServiceShape | AppointmentServiceShape[]
      }[]
    | null
}

function resolveAppointmentRow(
  appointments: EncounterImmigrationShape['appointments']
): { patient_id?: number | null; services?: AppointmentServiceShape | AppointmentServiceShape[] } | null {
  if (!appointments) return null
  const appt = Array.isArray(appointments) ? appointments[0] : appointments
  if (!appt || typeof appt !== 'object') return null
  return appt as { patient_id?: number | null; services?: AppointmentServiceShape | AppointmentServiceShape[] }
}

function resolveAppointmentService(
  appointments: EncounterImmigrationShape['appointments']
): AppointmentServiceShape {
  const appt = resolveAppointmentRow(appointments)
  if (!appt) return null
  const svc = appt.services
  if (!svc) return null
  return Array.isArray(svc) ? svc[0] ?? null : svc
}

/** Resolve patient id from encounter row, falling back to linked appointment. */
export function resolveEncounterPatientId(enc: EncounterImmigrationShape | null | undefined): number | null {
  if (!enc) return null
  const direct = Number(enc.patient_id)
  if (Number.isFinite(direct) && direct > 0) return direct
  const appt = resolveAppointmentRow(enc.appointments)
  const fromAppt = Number(appt?.patient_id)
  if (Number.isFinite(fromAppt) && fromAppt > 0) return fromAppt
  return null
}

/** True when encounter is an immigration I-693 workflow (consent, program, or appointment service). */
export function isImmigrationEncounterForI693(enc: EncounterImmigrationShape | null | undefined): boolean {
  if (!enc) return false
  if (isImmigrationEncounter(enc.consent_ack)) return true
  if (enc.program_type === IMMIGRATION_PROGRAM) return true
  const svc = resolveAppointmentService(enc.appointments)
  return isImmigrationServiceTitle(svc?.title_en) || isImmigrationServiceTitle(svc?.title_es)
}

const ENCOUNTER_IMMIGRATION_SELECT = `
  id,
  patient_id,
  consent_ack,
  program_type,
  appointments:appointment_id (
    patient_id,
    services:service_id ( title_en, title_es )
  )
`

/** Supabase select fragment for immigration eligibility checks (server). */
export const ENCOUNTER_I693_ELIGIBILITY_SELECT = ENCOUNTER_IMMIGRATION_SELECT

export async function loadEncounterImmigrationContext(
  admin: SupabaseClient,
  encounterId: number
): Promise<{
  patientId: number
  isImmigration: boolean
} | null> {
  const { data: enc, error } = await admin
    .from('encounters')
    .select(ENCOUNTER_IMMIGRATION_SELECT)
    .eq('id', encounterId)
    .maybeSingle()

  if (error) throw error
  if (!enc) return null

  const resolvedPatientId = resolveEncounterPatientId(enc as EncounterImmigrationShape)
  if (!resolvedPatientId) return null

  return {
    patientId: resolvedPatientId,
    isImmigration: isImmigrationEncounterForI693(enc as EncounterImmigrationShape),
  }
}
