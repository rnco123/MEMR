import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { isActiveFlowboardRow } from '@/lib/locations/flowboard-data'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const [{ data: allLocations }, { data: appointments, error: appointmentsError }] =
      await Promise.all([
        admin.from('locations').select('id, title').order('title'),
        admin
          .from('appointments')
          .select(
            'id, patient_id, appointment_date, appointment_time, onsite_type, created_at, location_id'
          )
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true }),
      ])

    if (appointmentsError) throw appointmentsError
    if (!appointments?.length) {
      return NextResponse.json({ data: [], locations: allLocations ?? [] })
    }

    const patientIds = [...new Set(appointments.map((a) => a.patient_id).filter(Boolean))]
    const appointmentIds = appointments.map((a) => a.id)

    const locationTitleById = new Map((allLocations ?? []).map((l) => [l.id, l.title]))

    const [{ data: patients }, { data: encounters }] = await Promise.all([
      admin
        .from('patients')
        .select('id, first_name, last_name, email, phone, date_of_birth, location_id')
        .in('id', patientIds),
      admin
        .from('encounters')
        .select('id, appointment_id, status')
        .in('appointment_id', appointmentIds),
    ])

    const rows = appointments.flatMap((appointment) => {
      const patient = patients?.find((p) => p.id === appointment.patient_id)
      const encounter = encounters?.find((e) => e.appointment_id === appointment.id)
      if (!isActiveFlowboardRow(appointment.appointment_date, encounter?.status ?? null)) return []
      const effectiveLocationId = patient?.location_id ?? appointment.location_id ?? null
      return [{
        ...appointment,
        location_id: effectiveLocationId,
        location_title:
          effectiveLocationId != null
            ? locationTitleById.get(effectiveLocationId) ?? null
            : null,
        patient: patient
          ? {
              id: patient.id,
              first_name: patient.first_name,
              last_name: patient.last_name,
              email: patient.email,
              phone: patient.phone,
              date_of_birth: patient.date_of_birth,
              location_id: patient.location_id,
            }
          : null,
        encounter_status: encounter?.status ?? null,
        encounter_id: encounter?.id ?? null,
      }]
    })

    return NextResponse.json({ data: rows, locations: allLocations ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}
