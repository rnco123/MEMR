/**
 * Zod validation schemas for all API inputs
 */

import { z } from 'zod'

// Signup validation
export const signupSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes'),
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim()
    .max(255, 'Email is too long'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
    .refine(
      (password) => {
        // Check for common passwords
        const commonPasswords = ['password', '12345678', 'password123', 'admin123']
        return !commonPasswords.includes(password.toLowerCase())
      },
      { message: 'Password is too common. Please choose a stronger password.' }
    ),
  role: z.enum(['doctor', 'nurse', 'admin'], {
    errorMap: () => ({ message: 'Role must be doctor, nurse, or admin' }),
  }),
  pin: z
    .string()
    .length(4, 'PIN must be exactly 4 characters')
    .regex(/^\d{4}$/, 'PIN must be 4 digits'),
})

export type SignupInput = z.infer<typeof signupSchema>

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
export const documentUploadSchema = z.object({
  document_name: z.string().min(1, 'Document name is required').max(200).trim(),
  document_label: z.enum([
    'image',
    'report',
    'bill',
    'prescription',
    'lab_result',
    'xray',
    'immigration',
    'i693',
    'other',
  ]),
})

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>

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
})

export const nurseWalkInCreateSchema = z.object({
  patient_id: z.number().int().positive(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointment_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional()
    .nullable(),
  service_id: z.number().int().positive().optional(),
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
  address: nullableOptionalString(1000),
  phone: nullableOptionalString(50),
  email: nullableOptionalEmail,
  opening_hours: nullableOptionalString(2000),
  google_map_url: nullableOptionalString(2000),
  is_active: z.boolean().optional(),
})

export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>

export const tenantCreateSchema = z.object({
  name: z.string().min(1).max(200),
  tenant_code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Tenant code must be letters, numbers, hyphen, or underscore'),
})

export type TenantCreateInput = z.infer<typeof tenantCreateSchema>
