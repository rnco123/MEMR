import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const { data: patientsData, error: patientsError } = await admin
      .from('patients')
      .select('id, first_name, last_name, email, phone, date_of_birth, gender, created_at')
      .order('created_at', { ascending: false })

    if (patientsError) throw patientsError
    if (!patientsData?.length) {
      return NextResponse.json({ rows: [], total: 0 })
    }

    const patientIds = patientsData.map((p) => p.id)

    const [encountersRes, appointmentsRes] = await Promise.all([
      admin
        .from('encounters')
        .select('id, patient_id, appointment_id, created_at')
        .in('patient_id', patientIds),
      admin
        .from('appointments')
        .select('patient_id, appointment_date, appointment_time')
        .in('patient_id', patientIds),
    ])

    const encounterCounts: Record<number, number> = {}
    const encounterLastVisits: Record<number, string> = {}
    const appointmentLastVisits: Record<number, string> = {}

    for (const encounter of encountersRes.data ?? []) {
      const pid = encounter.patient_id
      if (!pid) continue
      encounterCounts[pid] = (encounterCounts[pid] || 0) + 1
      if (!encounterLastVisits[pid] || encounter.created_at > encounterLastVisits[pid]) {
        encounterLastVisits[pid] = encounter.created_at
      }
    }

    for (const appointment of appointmentsRes.data ?? []) {
      if (!appointment.patient_id || !appointment.appointment_date) continue
      const dateTimeString = appointment.appointment_time
        ? `${appointment.appointment_date}T${appointment.appointment_time}`
        : appointment.appointment_date
      const existing = appointmentLastVisits[appointment.patient_id]
      if (!existing || new Date(dateTimeString).getTime() > new Date(existing).getTime()) {
        appointmentLastVisits[appointment.patient_id] = dateTimeString
      }
    }

    const rows = patientsData.map((patient) => {
      const encounterDate = encounterLastVisits[patient.id] || null
      const appointmentDate = appointmentLastVisits[patient.id] || null
      let lastVisit: string | null = null
      if (encounterDate && appointmentDate) {
        lastVisit =
          new Date(encounterDate).getTime() >= new Date(appointmentDate).getTime()
            ? encounterDate
            : appointmentDate
      } else {
        lastVisit = encounterDate || appointmentDate || null
      }

      return {
        ...patient,
        encounter_count: encounterCounts[patient.id] || 0,
        last_visit: lastVisit,
      }
    })

    return NextResponse.json({ rows, total: rows.length })
  } catch (err) {
    return handleApiError(err)
  }
}
