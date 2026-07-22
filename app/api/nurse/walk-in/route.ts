import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthorizationError,
  handleApiError,
  NotFoundError,
  ValidationError,
} from '@/lib/api-error-handler'
import { buildIntakeFormRow } from '@/lib/nurse/walk-in-intake'
import { requireNurseUser } from '@/lib/nurse/require-nurse'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import {
  getLocationScopeForUser,
  isAllowedByLocationScope,
} from '@/lib/locations/scope'
import { UserRole } from '@/lib/roles'
import { nurseWalkInCreateSchema } from '@/lib/validation'
import { insertEncounter } from '@/lib/encounters/insert-encounter'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

function normalizeTime(raw: string | null | undefined): string {
  if (!raw?.trim()) {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
  }
  const t = raw.trim()
  return t.length === 5 ? `${t}:00` : t
}

export async function GET() {
  try {
    await requireNurseUser()
    const admin = createAdminClient()

    const { data: services, error: servicesError } = await admin
      .from('services')
      .select('id, title_en, title_es')
      .order('title_en', { ascending: true })

    if (servicesError) throw servicesError

    const { data: pharmacies, error: pharmError } = await admin
      .from('pharmacy')
      .select('id, name, address, city, state, zip_code, phone, phone_number, email, is_active')
      .or('is_active.is.null,is_active.eq.true')
      .order('name', { ascending: true })
      .limit(500)

    if (pharmError) throw pharmError

    return NextResponse.json({
      services: services ?? [],
      pharmacies: pharmacies ?? [],
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireNurseUser()
    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, UserRole.NURSE)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = nurseWalkInCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data

    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id, location_id')
      .eq('id', v.patient_id)
      .maybeSingle()

    if (patientError) throw patientError
    if (!patient) throw new NotFoundError('Patient not found')

    const effectiveLocationId = v.location_id ?? patient.location_id ?? null
    if (!isAllowedByLocationScope(scope, effectiveLocationId)) {
      throw new AuthorizationError('Patient is outside your assigned locations')
    }

    let serviceId = v.service_id
    if (v.pharmacy_id != null) {
      const { data: pharmacy } = await admin
        .from('pharmacy')
        .select('id')
        .eq('id', v.pharmacy_id)
        .maybeSingle()
      if (!pharmacy) throw new ValidationError('Pharmacy not found')
    }

    const appointmentTime = normalizeTime(v.appointment_time)

    const { data: appointment, error: apptError } = await admin
      .from('appointments')
      .insert({
        patient_id: v.patient_id,
        service_id: serviceId,
        appointment_date: v.appointment_date,
        appointment_time: appointmentTime,
        location_id: effectiveLocationId,
        onsite_type: v.onsite_type ?? 'onsite',
      })
      .select('id')
      .single()

    if (apptError) throw apptError

    const appointmentId = Number(appointment.id)
    let intakeId: number | null = null

    const intakeRow = buildIntakeFormRow(v.intake)
    if (intakeRow) {
      const { data: intake, error: intakeError } = await admin
        .from('intake_form')
        .insert({ appointment_id: appointmentId, ...intakeRow })
        .select('id')
        .single()
      if (intakeError) throw intakeError
      intakeId = Number(intake.id)
    }

    const encounterPayload = {
      appointment_id: appointmentId,
      patient_id: v.patient_id,
      intake_id: intakeId,
      pharmacy_id: v.pharmacy_id ?? null,
      status: 'appointment_initiated',
    }

    const { data: encounter, error: encError } = await insertEncounter(admin, encounterPayload)

    if (encError) throw encError

    const encounterId = Number(encounter.id)
    const profileId = await getProfileId(supabase, user.id)
    if (profileId) {
      await insertStatusTimeline(supabase, {
        encounterId,
        status: 'appointment_initiated',
        profileId,
      })
    }

    auditPhi({
      user,
      role: 'nurse',
      action: 'encounter_created',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: {
        source: 'walk_in',
        patient_id: v.patient_id,
        appointment_id: appointmentId,
        intake_id: intakeId,
      },
      request,
    })

    return NextResponse.json({
      success: true,
      data: {
        patient_id: v.patient_id,
        appointment_id: appointmentId,
        encounter_id: encounterId,
        intake_id: intakeId,
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
