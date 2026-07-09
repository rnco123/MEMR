import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { isImmigrationEncounterForI693 } from '@/lib/i693/immigration-eligibility'
import { isI693ApiRole } from '@/lib/immigration/api-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()

    const admin = createAdminClient()
    const { data: encounters, error } = await admin
      .from('encounters')
      .select(
        `
        id,
        patient_id,
        appointment_id,
        status,
        consent_ack,
        program_type,
        updated_at,
        patients:patient_id ( id, first_name, last_name, date_of_birth ),
        appointments:appointment_id (
          appointment_date,
          appointment_time,
          services:service_id ( title_en, title_es )
        )
      `
      )
      .order('updated_at', { ascending: false })
      .limit(200)

    if (error) throw error

    const immigration = (encounters ?? []).filter((e) => isImmigrationEncounterForI693(e))

    const patientIds = [...new Set(immigration.map((e) => Number((e as { patient_id: number }).patient_id)))]
    const i693ByPatient = new Map<number, { status: string; ai_filled_at: string | null }>()
    if (patientIds.length > 0) {
      const { data: subs } = await admin
        .from('i693_submissions')
        .select('patient_id, status, ai_filled_at')
        .in('patient_id', patientIds)
      for (const s of subs ?? []) {
        i693ByPatient.set(Number(s.patient_id), {
          status: String(s.status),
          ai_filled_at: s.ai_filled_at as string | null,
        })
      }
    }

    const data = immigration.map((e) => {
      const raw = e as Record<string, unknown>
      const id = Number(raw.id)
      const patientId = Number(raw.patient_id)
      const patientsRaw = raw.patients
      const patient =
        patientsRaw && typeof patientsRaw === 'object' && !Array.isArray(patientsRaw)
          ? (patientsRaw as { first_name?: string; last_name?: string })
          : Array.isArray(patientsRaw) && patientsRaw[0]
            ? (patientsRaw[0] as { first_name?: string; last_name?: string })
            : null
      const apptRaw = raw.appointments
      const appt =
        apptRaw && typeof apptRaw === 'object' && !Array.isArray(apptRaw)
          ? (apptRaw as { appointment_date?: string | null; appointment_time?: string | null })
          : Array.isArray(apptRaw) && apptRaw[0]
            ? (apptRaw[0] as { appointment_date?: string | null; appointment_time?: string | null })
            : null
      const sub = i693ByPatient.get(patientId)
      return {
        encounter_id: id,
        patient_id: patientId,
        encounter_status: String(raw.status ?? ''),
        patient_name: patient
          ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim()
          : `Patient #${patientId}`,
        appointment_date: appt?.appointment_date ?? null,
        appointment_time: appt?.appointment_time ?? null,
        i693_status: sub?.status ?? null,
        i693_ai_filled_at: sub?.ai_filled_at ?? null,
      }
    })

    return NextResponse.json({ data, count: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}
