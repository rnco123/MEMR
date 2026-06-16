import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createExternalAdminClient } from '@/lib/supabase/external-admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from '@/lib/api-error-handler'
import { guardEncounterAccess } from '@/lib/encounters/guard'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['doctor', 'nurse', 'staff'])

type IntakeRow = {
  appointment_id: number
  chief_complaint?: string | null
  location?: string | null
  severity?: number | null
  symptoms_description?: string | null
  medical_conditions?: unknown
  surgeries?: unknown
  allergies?: unknown
  current_medications?: unknown
  fh_diabetes?: boolean | null
  fh_hypertension?: boolean | null
  fh_cancer?: boolean | null
  fh_heart_disease?: boolean | null
  tobacco_use?: boolean | null
  alcohol_use?: boolean | null
  drug_use?: boolean | null
  onset?: string | null
  relieving_factors?: unknown
  cancer_type?: string | null
  number_of_pregnancies?: number | null
  birth_control?: string | null
  last_pap_smear_status?: string | null
  last_pap_smear_month_year?: string | null
  mammography_status?: string | null
  mammography_month_year?: string | null
  last_prostate_exam_status?: string | null
  last_prostate_exam_month_year?: string | null
  occupation?: number | null
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      throw new ValidationError('Invalid encounter id')
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const role = roleInfo?.role?.toLowerCase()
    if (!role || !ALLOWED_ROLES.has(role)) {
      throw new AuthorizationError('You are not allowed to sync encounters to MCM')
    }

    await guardEncounterAccess(user.id, encounterId)

    const { data: encounter, error: encounterErr } = await supabase
      .from('encounters')
      .select('id, appointment_id, intake_id, status, mcm_encounter_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encounterErr) throw encounterErr
    if (!encounter) throw new NotFoundError('Encounter not found')

    const now = new Date().toISOString()
    const external = createExternalAdminClient()

    await supabase
      .from('encounters')
      .update({
        mcm_sync_status: 'copy_in_progress',
        mcm_sync_last_attempt_at: now,
        mcm_sync_error: null,
      })
      .eq('id', encounterId)

    // If already mapped, verify external encounter still exists and return.
    if (encounter.mcm_encounter_id) {
      const { data: existingExternal, error: existingExternalErr } = await external
        .from('encounter')
        .select('id')
        .eq('id', encounter.mcm_encounter_id)
        .maybeSingle()

      if (!existingExternalErr && existingExternal?.id) {
        await supabase
          .from('encounters')
          .update({
            mcm_sync_status: 'copied',
            mcm_synced_at: now,
            mcm_sync_error: null,
          })
          .eq('id', encounterId)

        return NextResponse.json({
          success: true,
          encounter_id: encounterId,
          mcm_encounter_id: encounter.mcm_encounter_id,
          message: 'Encounter already mapped to MCM',
        })
      }
    }

    // Ensure MCM appointment exists; create best-effort when missing.
    const { data: mcmAppointmentInitial, error: mcmAppointmentErr } = await external
      .from('Appoinments')
      .select('id')
      .eq('id', encounter.appointment_id)
      .maybeSingle()
    let mcmAppointment = mcmAppointmentInitial

    let resolvedMcmIntakeId: number | null = null

    if (mcmAppointmentErr || !mcmAppointment) {
      const { data: localAppointment, error: localAppointmentErr } = await supabase
        .from('appointments')
        .select('id, patient_id, location_id, service_id, appointment_date, appointment_time, notes')
        .eq('id', encounter.appointment_id)
        .maybeSingle()

      if (localAppointmentErr || !localAppointment) {
        const reason =
          localAppointmentErr?.message ||
          `Local appointment ${encounter.appointment_id} not found; cannot create in MCM.`
        await supabase
          .from('encounters')
          .update({
            mcm_sync_status: 'copy_failed',
            mcm_sync_error: reason,
          })
          .eq('id', encounterId)
        throw new ValidationError(reason)
      }

      // Ensure MCM patient exists first (Appoinments.patient_id FK -> allpatients.id).
      let resolvedMcmPatientId: number | null = localAppointment.patient_id ?? null
      if (localAppointment.patient_id) {
        const { data: existingMcmPatient, error: existingMcmPatientErr } = await external
          .from('allpatients')
          .select('id')
          .eq('id', localAppointment.patient_id)
          .maybeSingle()

        if (existingMcmPatientErr) {
          const reason = existingMcmPatientErr.message || 'Failed checking MCM patient'
          await supabase
            .from('encounters')
            .update({
              mcm_sync_status: 'copy_failed',
              mcm_sync_error: reason,
            })
            .eq('id', encounterId)
          throw new ValidationError(reason)
        }

        if (existingMcmPatient?.id) {
          resolvedMcmPatientId = existingMcmPatient.id
        } else {
          const { data: localPatient, error: localPatientErr } = await supabase
            .from('patients')
            .select('id, first_name, last_name, email, phone, gender')
            .eq('id', localAppointment.patient_id)
            .maybeSingle()

          if (localPatientErr || !localPatient) {
            const reason =
              localPatientErr?.message ||
              `Local patient ${localAppointment.patient_id} not found; cannot create in MCM.`
            await supabase
              .from('encounters')
              .update({
                mcm_sync_status: 'copy_failed',
                mcm_sync_error: reason,
              })
              .eq('id', encounterId)
            throw new ValidationError(reason)
          }

          // Try to resolve by unique-ish identity first (email/phone), then create.
          let foundByIdentity: { id: number } | null = null
          if (localPatient.email) {
            const { data } = await external
              .from('allpatients')
              .select('id')
              .ilike('email', localPatient.email)
              .limit(1)
              .maybeSingle()
            if (data?.id) foundByIdentity = { id: data.id }
          }
          if (!foundByIdentity && localPatient.phone) {
            const { data } = await external
              .from('allpatients')
              .select('id')
              .eq('phone', localPatient.phone)
              .limit(1)
              .maybeSingle()
            if (data?.id) foundByIdentity = { id: data.id }
          }

          if (foundByIdentity?.id) {
            resolvedMcmPatientId = foundByIdentity.id
          } else {
            const commonPatientPayload = {
              firstname: localPatient.first_name,
              lastname: localPatient.last_name,
              email: localPatient.email ?? null,
              phone: localPatient.phone ?? null,
              gender: localPatient.gender ?? null,
              locationid: localAppointment.location_id ?? null,
              treatmenttype: null,
              onsite: null,
              note: null,
            }

            // First try preserving EMR id; if MCM schema forbids explicit identity, retry without id.
            const withIdPayload = { id: localPatient.id, ...commonPatientPayload }
            let insertedMcmPatient: { id: number } | null = null
            let insertedMcmPatientErr: { message?: string } | null = null

            const firstTry = await external
              .from('allpatients')
              .insert(withIdPayload)
              .select('id')
              .maybeSingle()
            insertedMcmPatient = (firstTry.data as { id: number } | null) ?? null
            insertedMcmPatientErr = firstTry.error as { message?: string } | null

            if (!insertedMcmPatient?.id && insertedMcmPatientErr?.message) {
              const needsIdentityFallback =
                insertedMcmPatientErr.message.toLowerCase().includes('identity') ||
                insertedMcmPatientErr.message.toLowerCase().includes('generated') ||
                insertedMcmPatientErr.message.toLowerCase().includes('default')

              if (needsIdentityFallback) {
                const secondTry = await external
                  .from('allpatients')
                  .insert(commonPatientPayload)
                  .select('id')
                  .maybeSingle()
                insertedMcmPatient = (secondTry.data as { id: number } | null) ?? null
                insertedMcmPatientErr = secondTry.error as { message?: string } | null
              }
            }

            if (insertedMcmPatient?.id) {
              resolvedMcmPatientId = insertedMcmPatient.id
            } else {
              // Final resolve attempt by identity after insert attempts.
              let postInsertIdentity: { id: number } | null = null
              if (localPatient.email) {
                const { data } = await external
                  .from('allpatients')
                  .select('id')
                  .ilike('email', localPatient.email)
                  .limit(1)
                  .maybeSingle()
                if (data?.id) postInsertIdentity = { id: data.id }
              }
              if (!postInsertIdentity && localPatient.phone) {
                const { data } = await external
                  .from('allpatients')
                  .select('id')
                  .eq('phone', localPatient.phone)
                  .limit(1)
                  .maybeSingle()
                if (data?.id) postInsertIdentity = { id: data.id }
              }

              if (postInsertIdentity?.id) {
                resolvedMcmPatientId = postInsertIdentity.id
              } else {
                const reason =
                  insertedMcmPatientErr?.message ||
                  `MCM patient ${localPatient.id} missing and auto-create failed.`
                await supabase
                  .from('encounters')
                  .update({
                    mcm_sync_status: 'copy_failed',
                    mcm_sync_error: reason,
                  })
                  .eq('id', encounterId)
                throw new ValidationError(reason)
              }
            }
          }
        }
      }

      const dateTime =
        localAppointment.appointment_date && localAppointment.appointment_time
          ? `${localAppointment.appointment_date}T${localAppointment.appointment_time}`
          : localAppointment.appointment_date ||
            new Date().toISOString()

      const appointmentInsertPayload = {
        id: localAppointment.id,
        patient_id: resolvedMcmPatientId,
        location_id: localAppointment.location_id ?? null,
        service: localAppointment.service_id ? String(localAppointment.service_id) : null,
        date_and_time: dateTime,
        isApproved: true,
        provider_name: null,
        notes: localAppointment.notes ?? null,
      }

      const { data: insertedAppointment, error: insertedAppointmentErr } = await external
        .from('Appoinments')
        .insert(appointmentInsertPayload)
        .select('id')
        .maybeSingle()

      if (insertedAppointmentErr || !insertedAppointment?.id) {
        const reason =
          insertedAppointmentErr?.message ||
          `MCM appointment ${encounter.appointment_id} missing and auto-create failed.`
        await supabase
          .from('encounters')
          .update({
            mcm_sync_status: 'copy_failed',
            mcm_sync_error: reason,
          })
          .eq('id', encounterId)
        throw new ValidationError(reason)
      }

      mcmAppointment = insertedAppointment
    }

    // Ensure MCM intake exists because MCM encounter.intake_id is NOT NULL in this environment.
    if (encounter.intake_id) {
      const { data: existingById } = await external
        .from('intake_form')
        .select('id')
        .eq('id', encounter.intake_id)
        .maybeSingle()
      if (existingById?.id) {
        resolvedMcmIntakeId = existingById.id
      }
    }
    if (!resolvedMcmIntakeId) {
      const { data: existingByAppointment } = await external
        .from('intake_form')
        .select('id')
        .eq('appointment_id', encounter.appointment_id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingByAppointment?.id) {
        resolvedMcmIntakeId = existingByAppointment.id
      }
    }

    if (!resolvedMcmIntakeId) {
      // Auto-copy intake from EMR -> MCM (best-effort) when absent.
      let localIntake: IntakeRow | null = null

      if (encounter.intake_id) {
        const { data } = await supabase
          .from('intake_form')
          .select(
            'appointment_id, chief_complaint, location, severity, symptoms_description, medical_conditions, surgeries, allergies, current_medications, fh_diabetes, fh_hypertension, fh_cancer, fh_heart_disease, tobacco_use, alcohol_use, drug_use, onset, relieving_factors, cancer_type, number_of_pregnancies, birth_control, last_pap_smear_status, last_pap_smear_month_year, mammography_status, mammography_month_year, last_prostate_exam_status, last_prostate_exam_month_year, occupation'
          )
          .eq('id', encounter.intake_id)
          .maybeSingle()
        localIntake = (data as IntakeRow | null) ?? null
      }
      if (!localIntake) {
        const { data } = await supabase
          .from('intake_form')
          .select(
            'appointment_id, chief_complaint, location, severity, symptoms_description, medical_conditions, surgeries, allergies, current_medications, fh_diabetes, fh_hypertension, fh_cancer, fh_heart_disease, tobacco_use, alcohol_use, drug_use, onset, relieving_factors, cancer_type, number_of_pregnancies, birth_control, last_pap_smear_status, last_pap_smear_month_year, mammography_status, mammography_month_year, last_prostate_exam_status, last_prostate_exam_month_year, occupation'
          )
          .eq('appointment_id', encounter.appointment_id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        localIntake = (data as IntakeRow | null) ?? null
      }

      if (localIntake) {
        const intakePayload = {
          appointment_id: encounter.appointment_id,
          chief_complaint: localIntake.chief_complaint ?? null,
          location: localIntake.location ?? null,
          severity: localIntake.severity ?? null,
          symptoms_description: localIntake.symptoms_description ?? null,
          medical_conditions: localIntake.medical_conditions ?? null,
          surgeries: localIntake.surgeries ?? null,
          allergies: localIntake.allergies ?? null,
          current_medications: localIntake.current_medications ?? null,
          fh_diabetes: localIntake.fh_diabetes ?? null,
          fh_hypertension: localIntake.fh_hypertension ?? null,
          fh_cancer: localIntake.fh_cancer ?? null,
          fh_heart_disease: localIntake.fh_heart_disease ?? null,
          tobacco_use: localIntake.tobacco_use ?? null,
          alcohol_use: localIntake.alcohol_use ?? null,
          drug_use: localIntake.drug_use ?? null,
          onset: localIntake.onset ?? null,
          relieving_factors: localIntake.relieving_factors ?? null,
          cancer_type: localIntake.cancer_type ?? null,
          number_of_pregnancies: localIntake.number_of_pregnancies ?? null,
          birth_control: localIntake.birth_control ?? null,
          last_pap_smear_status: localIntake.last_pap_smear_status ?? null,
          last_pap_smear_month_year: localIntake.last_pap_smear_month_year ?? null,
          mammography_status: localIntake.mammography_status ?? null,
          mammography_month_year: localIntake.mammography_month_year ?? null,
          last_prostate_exam_status: localIntake.last_prostate_exam_status ?? null,
          last_prostate_exam_month_year: localIntake.last_prostate_exam_month_year ?? null,
          occupation: localIntake.occupation ?? null,
        }

        const { error: intakeInsertErr } = await external
          .from('intake_form')
          .insert(intakePayload)

        if (!intakeInsertErr) {
          const { data: insertedByAppointment } = await external
            .from('intake_form')
            .select('id')
            .eq('appointment_id', encounter.appointment_id)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (insertedByAppointment?.id) {
            resolvedMcmIntakeId = insertedByAppointment.id
          }
        }
      }

      if (!resolvedMcmIntakeId) {
        const reason =
          'MCM intake_form missing for this appointment. Auto-copy intake failed.'
        await supabase
          .from('encounters')
          .update({
            mcm_sync_status: 'copy_failed',
            mcm_sync_error: reason,
          })
          .eq('id', encounterId)
        throw new ValidationError(reason)
      }
    }

    const { data: insertedEncounter, error: insertErr } = await external
      .from('encounter')
      .insert({
        appointment_id: encounter.appointment_id,
        intake_id: resolvedMcmIntakeId,
      })
      .select('id')
      .single()

    if (insertErr || !insertedEncounter?.id) {
      const reason = insertErr?.message || 'Failed to create MCM encounter'
      await supabase
        .from('encounters')
        .update({
          mcm_sync_status: 'copy_failed',
          mcm_sync_error: reason,
        })
        .eq('id', encounterId)
      throw new ValidationError(reason)
    }

    await supabase
      .from('encounters')
      .update({
        mcm_encounter_id: insertedEncounter.id,
        mcm_sync_status: 'copied',
        mcm_synced_at: now,
        mcm_sync_error: null,
      })
      .eq('id', encounterId)

    return NextResponse.json({
      success: true,
      encounter_id: encounterId,
      mcm_encounter_id: insertedEncounter.id,
      message: 'Encounter copied to MCM',
    })
  } catch (e) {
    return handleApiError(e)
  }
}
