/**
 * Zod validation schemas for all API inputs
 */

import { z } from 'zod'

// Patient validation
export const patientSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100).trim(),
  last_name: z.string().min(1, 'Last name is required').max(100).trim(),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .optional()
    .nullable(),
  date_of_birth: z
    .date()
    .max(new Date(), 'Date of birth cannot be in the future')
    .optional()
    .nullable(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional().nullable(),
  street_address: z.string().max(200).optional().nullable(),
  zip_code: z.string().max(10).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  location_id: z.number().int().positive().optional().nullable(),
})

export type PatientInput = z.infer<typeof patientSchema>

// Document upload validation
export const PATIENT_DOCUMENT_LABELS = [
  'image',
  'report',
  'bill',
  'prescription',
  'lab_result',
  'xray',
  'immigration',
  'i693',
  'id_document',
  'previous_medical_records',
  'imaging',
  'future_appointments',
  'other',
] as const

export const documentUploadSchema = z.object({
  document_name: z.string().min(1, 'Document name is required').max(200).trim(),
  document_label: z.enum(PATIENT_DOCUMENT_LABELS),
})

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>
export type PatientDocumentLabel = (typeof PATIENT_DOCUMENT_LABELS)[number]

// Message validation
export const messageSchema = z.object({
  conversation_id: z.string().uuid('Invalid conversation ID'),
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message is too long')
    .trim(),
})

export type MessageInput = z.infer<typeof messageSchema>

// Vitals validation
export const vitalsSchema = z.object({
  encounter_id: z.number().int().positive(),
  bp_systolic: z.number().int().min(70).max(250).optional().nullable(),
  bp_diastolic: z.number().int().min(40).max(150).optional().nullable(),
  heart_rate: z.number().int().min(30).max(220).optional().nullable(),
  respiratory_rate: z.number().int().min(8).max(40).optional().nullable(),
  temperature_f: z.number().min(90).max(110).optional().nullable(),
  temperature_c: z.number().min(32).max(43).optional().nullable(),
  spo2: z.number().int().min(0).max(100).optional().nullable(),
  weight_lbs: z.number().min(1).max(1000).optional().nullable(),
  weight_kg: z.number().min(0.5).max(500).optional().nullable(),
  height_in: z.number().min(12).max(96).optional().nullable(),
  height_cm: z.number().min(30).max(250).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

export type VitalsInput = z.infer<typeof vitalsSchema>

// Appointment validation
export const appointmentSchema = z.object({
  patient_id: z.number().int().positive(),
  appointment_date: z.string().datetime(),
  appointment_time: z.string().regex(/^\d{2}:\d{2}$/),
  service_id: z.number().int().positive(),
  location_id: z.number().int().positive().optional().nullable(),
  onsite_type: z.enum(['telemedicine', 'onsite']),
})

export type AppointmentInput = z.infer<typeof appointmentSchema>

/** Optional intake captured when a nurse creates a walk-in visit. */
export const nurseWalkInIntakeSchema = z.object({
  chief_complaint: z.string().max(500).optional().nullable(),
  onset: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  location: z.string().max(200).optional().nullable(),
  severity: z.number().int().min(1).max(10).optional().nullable(),
  symptoms_description: z.string().max(2000).optional().nullable(),
  relieving_factors: z.array(z.string().max(100)).optional(),
  current_medications: z.string().max(1000).optional().nullable(),
  medical_conditions: z.string().max(1000).optional().nullable(),
  surgeries: z.enum(['yes', 'no']).optional().nullable(),
  allergies: z.enum(['yes', 'no']).optional().nullable(),
  fh_hypertension: z.boolean().optional(),
  fh_diabetes: z.boolean().optional(),
  fh_cancer: z.boolean().optional(),
  fh_heart_disease: z.boolean().optional(),
  tobacco_use: z.boolean().optional(),
  alcohol_use: z.boolean().optional(),
  drug_use: z.boolean().optional(),
  occupation: z.number().int().positive().optional().nullable(),
})

/** Nurse-created (Direct) patient registration — EMR-only, never syncs to external Supabase.
 * Always creates a same-day appointment + encounter at `appointment_initiated`.
 * Intake / vitals / physical exam are entered later from the encounter modal.
 */
export const nursePatientCreateSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100).trim(),
  last_name: z.string().min(1, 'Last name is required').max(100).trim(),
  email: z.union([z.string().email().max(200), z.literal(''), z.null()]).optional(),
  phone: z.union([z.string().max(30), z.literal(''), z.null()]).optional(),
  gender: z.enum(['male', 'female', 'other']).optional().nullable(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .optional()
    .nullable(),
  street_address: z.union([z.string().max(500), z.literal(''), z.null()]).optional(),
  state: z.union([z.string().max(100), z.literal(''), z.null()]).optional(),
  zip_code: z.union([z.string().max(20), z.literal(''), z.null()]).optional(),
  location_id: z.number().int().positive(),
  is_text_opt_in: z.boolean().optional(),
  is_check_opt_in: z.boolean().optional(),
  /** Direct registration always opens as on-site; telemedicine is not selected here. */
  onsite_type: z.enum(['telemedicine', 'onsite']).optional().default('onsite'),
  /** Required clinic service / treatment type for the appointment. */
  service_id: z.number().int().positive(),
  pharmacy_id: z.number().int().positive().optional().nullable(),
})

export type NursePatientCreateInput = z.infer<typeof nursePatientCreateSchema>

export const nurseWalkInCreateSchema = z.object({
  patient_id: z.number().int().positive(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointment_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional()
    .nullable(),
  service_id: z.number().int().positive(),
  location_id: z.number().int().positive().optional().nullable(),
  onsite_type: z.enum(['telemedicine', 'onsite']).optional().default('onsite'),
  pharmacy_id: z.number().int().positive().optional().nullable(),
  intake: nurseWalkInIntakeSchema.optional(),
})

export type NurseWalkInIntakeInput = z.infer<typeof nurseWalkInIntakeSchema>
export type NurseWalkInCreateInput = z.infer<typeof nurseWalkInCreateSchema>

/** Doctor-recorded prescription (e-prescribe sync can populate external_rx_id) */
export const prescriptionCreateSchema = z.object({
  patient_id: z.number().int().positive(),
  encounter_id: z.number().int().positive().optional().nullable(),
  medication_name: z.string().min(1).max(500),
  dosage: z.string().max(500).optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  quantity: z.string().max(100).optional().nullable(),
  refills: z.number().int().min(0).max(99).optional().default(0),
  status: z.enum(['recorded', 'sent', 'cancelled']).optional(),
  external_rx_id: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

export type PrescriptionCreateInput = z.infer<typeof prescriptionCreateSchema>

/** Encounter workflow prescription (doctor + nurse until encounter completed) */
export const encounterPrescriptionCreateSchema = z.object({
  medication_name: z.string().min(1).max(500),
  dosage: z.string().max(500).optional().nullable(),
  dosage_instruction: z.string().max(150).optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  strength: z.string().max(50).optional().nullable(),
  route: z.string().max(50).optional().nullable(),
  frequency: z.string().max(50).optional().nullable(),
  duration: z.string().max(50).optional().nullable(),
  quantity: z.string().max(100).optional().nullable(),
  refills: z.number().int().min(0).max(99).optional().default(0),
  notes: z.string().max(2000).optional().nullable(),
})

export type EncounterPrescriptionCreateInput = z.infer<typeof encounterPrescriptionCreateSchema>

export const encounterPrescriptionUpdateSchema = encounterPrescriptionCreateSchema.partial()

export type EncounterPrescriptionUpdateInput = z.infer<typeof encounterPrescriptionUpdateSchema>

export const roomingPatchSchema = z.object({
  identity_verified: z.boolean().optional(),
  prescribing_location_ack: z.boolean().optional(),
  ma_supervision_ack: z.boolean().optional(),
  ready_for_doctor: z.boolean().optional(),
  ma_exam_findings: z.string().max(8000).optional().nullable(),
  consent_ack: z.record(z.string(), z.string()).optional(),
  pharmacy_id: z.number().int().positive().optional().nullable(),
})

export type RoomingPatchInput = z.infer<typeof roomingPatchSchema>

const physicalExamField = z.string().max(4000).optional().nullable()

const systemStatusField = z.enum(['N', 'A', 'NA']).nullable().optional()

const findingSelectionMap = z.record(z.string(), z.array(z.string().max(200))).optional()

export const rosExamDataSchema = z.object({
  ros: z.object({
    cons: systemStatusField,
    skin: systemStatusField,
    eyes: systemStatusField,
    ears: systemStatusField,
    nose: systemStatusField,
    throat: systemStatusField,
    cv_resp: systemStatusField,
    gi: systemStatusField,
    gu: systemStatusField,
    gyn: systemStatusField,
    gyn_lmp: z.string().max(50).optional().nullable(),
    male: systemStatusField,
    ms: systemStatusField,
    neu: systemStatusField,
    neu_numbness: z.string().max(200).optional().nullable(),
    neu_tingling: z.string().max(200).optional().nullable(),
    psych: systemStatusField,
    hemat_lymph: systemStatusField,
  }).optional(),
  exam: z.object({
    general: systemStatusField,
    skin: systemStatusField,
    head: systemStatusField,
    eyes: systemStatusField,
    ears: systemStatusField,
    nose: systemStatusField,
    throat: systemStatusField,
    neck: systemStatusField,
    cv: systemStatusField,
    respir: systemStatusField,
    abdomen: systemStatusField,
    gu: systemStatusField,
    rectal: systemStatusField,
    ms: systemStatusField,
    ms_sites: z.string().max(500).optional().nullable(),
    neuro: systemStatusField,
  }).optional(),
  ros_findings: findingSelectionMap,
  exam_findings: findingSelectionMap,
  remarks: z.string().max(8000).optional().nullable(),
}).optional()

/** Every clinical field is optional — nurse may save partial or empty exams. */
export const physicalExaminationDataSchema = z
  .object({
    general_appearance: physicalExamField,
    eyes_ears_nose_throat: physicalExamField,
    cardiovascular: physicalExamField,
    pulmonary: physicalExamField,
    abdomen: physicalExamField,
    musculoskeletal: physicalExamField,
    neurologic: physicalExamField,
    psychiatric: physicalExamField,
    skin: physicalExamField,
    lymphatic: physicalExamField,
    remarks: z.string().max(8000).optional().nullable(),
  })
  .partial()

export const physicalExaminationPatchSchema = z.object({
  physical_examination: physicalExaminationDataSchema.default({}),
  ros_exam: rosExamDataSchema.optional(),
})

export type PhysicalExaminationPatchInput = z.infer<typeof physicalExaminationPatchSchema>

export const encounterOrderCreateSchema = z.object({
  order_type: z.enum(['lab_draw', 'injection', 'immunization', 'poc_test', 'referral', 'other']),
  title: z.string().min(1).max(500),
  instructions: z.string().max(2000).optional().nullable(),
  ordered_by_doctor_id: z.number().int().positive().optional().nullable(),
})

export type EncounterOrderCreateInput = z.infer<typeof encounterOrderCreateSchema>

export const encounterOrderUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
})

export const postVisitTaskCreateSchema = z.object({
  encounter_id: z.number().int().positive().optional().nullable(),
  patient_id: z.number().int().positive(),
  task_type: z.enum(['follow_up_reminder', 'lab_review', 'rx_review', 'escalation', 'callback', 'other']),
  title: z.string().min(1).max(500),
  due_at: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

export type PostVisitTaskCreateInput = z.infer<typeof postVisitTaskCreateSchema>

export const postVisitTaskUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  notes: z.string().max(2000).optional().nullable(),
})

const nullableOptionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v))

export const pharmacyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  address: nullableOptionalString(1000),
  phone: nullableOptionalString(50),
  email: nullableOptionalString(200),
})

export type PharmacyCreateInput = z.infer<typeof pharmacyCreateSchema>

export const pharmacyRegistryCreateSchema = pharmacyCreateSchema.extend({
  assign_to_encounter_id: z.number().int().positive().optional(),
})

export type PharmacyRegistryCreateInput = z.infer<typeof pharmacyRegistryCreateSchema>

export const pharmacyUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: nullableOptionalString(1000),
  phone: nullableOptionalString(50),
  email: nullableOptionalString(200),
})

export type PharmacyUpdateInput = z.infer<typeof pharmacyUpdateSchema>

const nullableOptionalEmail = z.preprocess(
  (val) => (val === '' || val === undefined ? null : val),
  z.string().email('Invalid email address').max(200).trim().toLowerCase().nullable().optional()
)

const nullableTenantId = z.preprocess(
  (val) => (val === '' || val === undefined || val === null ? null : val),
  z.number().int().positive().nullable().optional()
)

export const locationCreateSchema = z.object({
  title: z.string().min(1).max(200),
  tenant_id: nullableTenantId,
  location_code: nullableOptionalString(50),
  location_group: nullableOptionalString(50),
  address: nullableOptionalString(1000),
  phone: nullableOptionalString(50),
  email: nullableOptionalEmail,
  opening_hours: nullableOptionalString(2000),
  google_map_url: nullableOptionalString(2000),
  is_active: z.boolean().optional(),
})

export type LocationCreateInput = z.infer<typeof locationCreateSchema>

export const locationUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  tenant_id: nullableTenantId,
  location_code: nullableOptionalString(50),
  location_group: nullableOptionalString(50),
  address: nullableOptionalString(1000),
  phone: nullableOptionalString(50),
  email: nullableOptionalEmail,
  opening_hours: nullableOptionalString(2000),
  google_map_url: nullableOptionalString(2000),
  is_active: z.boolean().optional(),
})

export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>

export const doctorSoapSaveSchema = z.object({
  subjective_text: z.string().min(1, 'Subjective is required').max(50000),
  objective_text: z.string().min(1, 'Objective is required').max(50000),
  assessment_text: z.string().min(1, 'Assessment is required').max(50000),
  plan_text: z.string().min(1, 'Plan is required').max(50000),
  seeded_from_ai: z.boolean().optional(),
})

export type DoctorSoapSaveInput = z.infer<typeof doctorSoapSaveSchema>

/** Post-completion additive SOAP amendment (does not overwrite original). */
export const amendmentNoteSaveSchema = z.object({
  subjective_text: z.string().min(1, 'Subjective is required').max(50000),
  objective_text: z.string().min(1, 'Objective is required').max(50000),
  assessment_text: z.string().min(1, 'Assessment is required').max(50000),
  plan_text: z.string().min(1, 'Plan is required').max(50000),
})

export type AmendmentNoteSaveInput = z.infer<typeof amendmentNoteSaveSchema>

export const patientInfoSaveSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100).trim(),
  last_name: z.string().min(1, 'Last name is required').max(100).trim(),
  email: z.union([z.string().max(200), z.literal(''), z.null()]).optional(),
  phone: z.union([z.string().max(30), z.literal(''), z.null()]).optional(),
  gender: z
    .union([
      z.enum(['male', 'female', 'other', 'Male', 'Female', 'Other', 'M', 'F']),
      z.literal(''),
      z.null(),
    ])
    .optional(),
  date_of_birth: z.union([z.string().max(20), z.literal(''), z.null()]).optional(),
  street_address: z.union([z.string().max(500), z.literal(''), z.null()]).optional(),
  state: z.union([z.string().max(100), z.literal(''), z.null()]).optional(),
  zip_code: z.union([z.string().max(20), z.literal(''), z.null()]).optional(),
})

export type PatientInfoSaveInput = z.infer<typeof patientInfoSaveSchema>

export const tenantCreateSchema = z.object({
  name: z.string().min(1).max(200),
  tenant_code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Tenant code must be letters, numbers, hyphen, or underscore'),
})

export type TenantCreateInput = z.infer<typeof tenantCreateSchema>

export const consentFormCreateSchema = z.object({
  tenant_id: z.number().int().positive(),
  name: z.string().min(1).max(200).trim(),
  is_active: z.boolean().optional().default(true),
  html: z.string().min(1).max(500_000),
})

export const consentFormUpdateSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  is_active: z.boolean().optional(),
  html: z.string().min(1).max(500_000).optional(),
})

export type ConsentFormCreateInput = z.infer<typeof consentFormCreateSchema>
export type ConsentFormUpdateInput = z.infer<typeof consentFormUpdateSchema>

export const releaseLogCreateSchema = z.object({
  task: z.string().min(1, 'Task is required').max(200).trim(),
  description: z.string().max(2000).trim().optional().nullable(),
  status: z.enum(['upcoming', 'released']).optional().default('upcoming'),
})

export const releaseLogUpdateSchema = z.object({
  task: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().optional().nullable(),
  status: z.enum(['upcoming', 'released']).optional(),
})

export type ReleaseLogCreateInput = z.infer<typeof releaseLogCreateSchema>
export type ReleaseLogUpdateInput = z.infer<typeof releaseLogUpdateSchema>
