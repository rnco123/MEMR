import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthorizationError,
  ConflictError,
  handleApiError,
  ValidationError,
} from '@/lib/api-error-handler'
import { requireNurseUser } from '@/lib/nurse/require-nurse'
import { buildIntakeFormRow } from '@/lib/nurse/walk-in-intake'
import {
  getLocationScopeForUser,
  isAllowedByLocationScope,
} from '@/lib/locations/scope'
import { UserRole } from '@/lib/roles'
import { nursePatientCreateSchema } from '@/lib/validation'
import { insertEncounter } from '@/lib/encounters/insert-encounter'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { auditPhi } from '@/lib/audit-phi'
import { emptyToNull, normalizePhoneForStorage, phoneMatchDigits } from '@/lib/patients/phone-normalize'
import { normalizePatientGender } from '@/lib/encounter/patient-gender'

export const dynamic = 'force-dynamic'

/**
 * POST /api/nurse/patients
 *
 * Create a patient chart directly in the EMR (created_by_source = Direct).
 * Direct patients are EMR-only — they must not be synced to external Supabase.
 * QR-created patients continue to use the existing QR edge-function path (default source QR).
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

    const phoneStored = normalizePhoneForStorage(v.phone) ?? emptyToNull(v.phone)
    const phoneDigits = phoneMatchDigits(v.phone)
    const dob = emptyToNull(v.date_of_birth)

    // Mirror QR duplicate matching (DOB + phone digits) so Direct create does not fork charts.
    if (dob && phoneDigits.length >= 10) {
      const { data: dobMatches, error: matchError } = await admin
        .from('patients')
        .select('id, phone, first_name, last_name, created_by_source')
        .eq('date_of_birth', dob)

      if (matchError) throw matchError

      const existing = (dobMatches ?? []).find(
        (row) => phoneMatchDigits(row.phone) === phoneDigits
      )
      if (existing) {
        throw new ConflictError(
          `A patient already exists with this date of birth and phone (ID ${existing.id}: ${existing.first_name} ${existing.last_name}). Search and select them instead of creating a duplicate.`
        )
      }
    }

    const gender = normalizePatientGender(v.gender)

    const { data: patient, error: insertError } = await admin
      .from('patients')
      .insert({
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
        is_text_opt_in: v.is_text_opt_in ?? false,
        is_check_opt_in: v.is_check_opt_in ?? false,
        emergency_contact_name: emptyToNull(v.emergency_contact_name),
        emergency_contact_phone:
          normalizePhoneForStorage(v.emergency_contact_phone) ??
          emptyToNull(v.emergency_contact_phone),
        emergency_contact_relationship: emptyToNull(v.emergency_contact_relationship),
        // Direct = EMR manual registration. Do not sync this row to external Supabase.
        created_by_source: 'Direct',
      })
      .select(
        'id, patient_code, first_name, last_name, email, phone, gender, date_of_birth, street_address, state, zip_code, location_id, created_by_source, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, created_at'
      )
      .single()

    if (insertError) throw insertError

    const patientId = Number(patient.id)
    let appointmentId: number | null = null
    let intakeId: number | null = null
    let encounterId: number | null = null

    const intakeRow = buildIntakeFormRow(v.intake)
    const shouldCreateVisit = Boolean(v.start_encounter) || Boolean(intakeRow)

    if (shouldCreateVisit) {
      let serviceId = v.service_id ?? null
      if (serviceId == null) {
        const { data: defaultService } = await admin
          .from('services')
          .select('id')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (!defaultService?.id) {
          throw new ValidationError('No service configured — add a service before starting a visit')
        }
        serviceId = Number(defaultService.id)
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
          onsite_type: v.onsite_type ?? 'onsite',
        })
        .select('id')
        .single()

      if (apptError) throw apptError
      appointmentId = Number(appointment.id)

      if (intakeRow) {
        const { data: intake, error: intakeError } = await admin
          .from('intake_form')
          .insert({ appointment_id: appointmentId, ...intakeRow })
          .select('id')
          .single()
        if (intakeError) throw intakeError
        intakeId = Number(intake.id)
      }

      if (v.start_encounter) {
        if (v.pharmacy_id != null) {
          const { data: pharmacy } = await admin
            .from('pharmacy')
            .select('id')
            .eq('id', v.pharmacy_id)
            .maybeSingle()
          if (!pharmacy) throw new ValidationError('Pharmacy not found')
        }

        const { data: encounter, error: encError } = await insertEncounter(admin, {
          appointment_id: appointmentId,
          patient_id: patientId,
          intake_id: intakeId,
          pharmacy_id: v.pharmacy_id ?? null,
          status: 'appointment_initiated',
        })
        if (encError) throw encError
        encounterId = Number(encounter.id)

        const profileId = await getProfileId(supabase, user.id)
        if (profileId) {
          await insertStatusTimeline(supabase, {
            encounterId,
            status: 'appointment_initiated',
            profileId,
          })
        }
      }
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
        intake_id: intakeId,
        encounter_id: encounterId,
        location_id: v.location_id,
      },
    })

    return NextResponse.json({
      patient,
      appointment_id: appointmentId,
      intake_id: intakeId,
      encounter_id: encounterId,
    }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
