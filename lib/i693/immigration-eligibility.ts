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
  consent_ack?: unknown
  program_type?: string | null
  appointments?:
    | {
        services?: AppointmentServiceShape | AppointmentServiceShape[]
      }
    | {
        services?: AppointmentServiceShape | AppointmentServiceShape[]
      }[]
    | null
}

function resolveAppointmentService(
  appointments: EncounterImmigrationShape['appointments']
): AppointmentServiceShape {
  if (!appointments) return null
  const appt = Array.isArray(appointments) ? appointments[0] : appointments
  if (!appt || typeof appt !== 'object') return null
  const svc = (appt as { services?: AppointmentServiceShape | AppointmentServiceShape[] }).services
  if (!svc) return null
  return Array.isArray(svc) ? svc[0] ?? null : svc
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
    services:service_id ( title_en, title_es )
  )
`

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

  const patientId = Number(enc.patient_id)
  if (!Number.isFinite(patientId)) return null

  return {
    patientId,
    isImmigration: isImmigrationEncounterForI693(enc as EncounterImmigrationShape),
  }
}
