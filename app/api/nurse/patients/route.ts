import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthorizationError,
  ConflictError,
  handleApiError,
  ValidationError,
} from '@/lib/api-error-handler'
import { requireNurseUser } from '@/lib/nurse/require-nurse'
import {
  getLocationScopeForUser,
  isAllowedByLocationScope,
} from '@/lib/locations/scope'
import { UserRole } from '@/lib/roles'
import { nursePatientCreateSchema } from '@/lib/validation'
import { insertEncounter } from '@/lib/encounters/insert-encounter'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { auditPhi } from '@/lib/audit-phi'
import { emptyToNull, normalizePhoneForStorage } from '@/lib/patients/phone-normalize'
import { normalizePatientGender } from '@/lib/encounter/patient-gender'
import { bridgePost } from '@/lib/bridge/sync'

export const dynamic = 'force-dynamic'

type PatientCreateResult = {
  source: string
  stores: Array<{
    store: string
    ok: boolean
    id?: string
    reason?: string
    record?: Record<string, unknown>
  }>
}

/**
 * POST /api/nurse/patients
 *
 * Create a Direct patient chart and open a visit:
 * patient → appointment → encounter (`appointment_initiated`).
 * Intake, vitals, and physical exam are documented later in the encounter modal.
 *
 * The patient itself is created by mcm-bridge, which owns both Supabase projects and
 * the rule that keeps Direct charts EMR-only. Duplicate matching lives there too.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user, profile } = await requireNurseUser()
    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, UserRole.NURSE)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = nursePatientCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    if (!isAllowedByLocationScope(scope, v.location_id)) {
      throw new AuthorizationError('Location is outside your assigned clinics')
    }

    const { data: service, error: serviceError } = await admin
      .from('services')
      .select('id')
      .eq('id', v.service_id)
      .maybeSingle()

    if (serviceError) throw serviceError
    if (!service) throw new ValidationError('Selected treatment / service was not found')
    const serviceId = Number(service.id)

    const phoneStored = normalizePhoneForStorage(v.phone) ?? emptyToNull(v.phone)
    const dob = emptyToNull(v.date_of_birth)
    const gender = normalizePatientGender(v.gender)

    // `Direct` selects the bridge rule that keeps this chart EMR-only. The bridge also
    // applies the DOB + phone duplicate check and answers 409 when it matches.
    const created = await bridgePost<PatientCreateResult>('/patients', {
      source: 'Direct',
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      email: emptyToNull(v.email),
      phone: phoneStored,
      gender,
      date_of_birth: dob,
      street_address: emptyToNull(v.street_address),
      state: emptyToNull(v.state),
      zip_code: emptyToNull(v.zip_code),
      location_id: v.location_id,
      emergency_contact_name: emptyToNull(v.emergency_contact_name),
      emergency_contact_phone: emptyToNull(v.emergency_contact_phone),
      emergency_contact_relationship: emptyToNull(v.emergency_contact_relationship),
      is_text_opt_in: v.is_text_opt_in ?? false,
      is_check_opt_in: v.is_check_opt_in ?? false,
    })

    const chart = created.stores.find((store) => store.store === 'emr.patients')
    if (!chart?.ok || !chart.record) {
      throw new ConflictError(chart?.reason ?? 'Bridge did not create the patient chart')
    }

    const patient = chart.record
    const patientId = Number(patient.id)

    if (v.pharmacy_id != null) {
      const { data: pharmacy } = await admin
        .from('pharmacy')
        .select('id')
        .eq('id', v.pharmacy_id)
        .maybeSingle()
      if (!pharmacy) throw new ValidationError('Pharmacy not found')
    }

    const now = new Date()
    const appointmentDate = now.toISOString().slice(0, 10)
    const appointmentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`

    const { data: appointment, error: apptError } = await admin
      .from('appointments')
      .insert({
        patient_id: patientId,
        service_id: serviceId,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        location_id: v.location_id,
        onsite_type: 'onsite',
      })
      .select('id')
      .single()

    if (apptError) throw apptError
    const appointmentId = Number(appointment.id)

    const { data: encounter, error: encError } = await insertEncounter(admin, {
      appointment_id: appointmentId,
      patient_id: patientId,
      intake_id: null,
      pharmacy_id: v.pharmacy_id ?? null,
      status: 'appointment_initiated',
    })
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
      role: profile.role ?? 'nurse',
      action: 'patient_created',
      resourceType: 'patient',
      resourceId: patientId,
      metadata: {
        source: 'direct_registration',
        created_by_source: 'Direct',
        appointment_id: appointmentId,
        encounter_id: encounterId,
        location_id: v.location_id,
        onsite_type: 'onsite',
      },
    })

    return NextResponse.json({
      patient,
      appointment_id: appointmentId,
      intake_id: null,
      encounter_id: encounterId,
    }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}