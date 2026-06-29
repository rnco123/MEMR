/** Explicit column lists for encounter detail API (no select('*')). */

// final_review_suggestions_json/final_review_suggestions_at are intentionally excluded:
// migration 043 that adds them was never applied to dev/staging, so selecting them 500s
// this entire endpoint (and every panel gated on the resulting `encounter` state).
export const ENCOUNTER_DETAIL_SELECT =
  'id, appointment_id, patient_id, intake_id, pharmacy_id, doctor_id, status, encounter_code, created_at, identity_verified_at, prescribing_location_ack_at, ma_supervision_ack_at, ready_for_doctor_at, consent_ack, program_type, risk_level, risk_rationale, risk_factors, risk_assessed_at, ma_exam_findings, updated_at'

export const ENCOUNTER_STATUS_SELECT = 'id, status'

export const PATIENT_DETAIL_SELECT =
  'id, first_name, last_name, email, phone, gender, date_of_birth, zip_code, state, street_address, patient_code, location_id, created_at'

export const PATIENT_FILE_SELECT =
  'id, first_name, last_name, email, phone, gender, date_of_birth, zip_code, state, street_address, patient_code, location_id, created_at, locations(title, location_code)'

export const APPOINTMENT_DETAIL_SELECT =
  'id, appointment_date, appointment_time, onsite_type, patient_id, service_id, services:service_id ( title_en, title_es )'

export const INTAKE_FORM_DETAIL_SELECT =
  'id, appointment_id, chief_complaint, location, severity, symptoms_description, medical_conditions, surgeries, allergies, current_medications, fh_diabetes, fh_hypertension, fh_cancer, fh_heart_disease, tobacco_use, alcohol_use, drug_use, onset, relieving_factors, cancer_type, number_of_pregnancies, birth_control, last_pap_smear_status, last_pap_smear_month_year, mammography_status, mammography_month_year, last_prostate_exam_status, last_prostate_exam_month_year, occupation, created_at'

export const INTAKE_VIDEO_SELECT =
  'chief_complaint, symptoms_description, location, severity, onset, medical_conditions, allergies, current_medications, surgeries, tobacco_use, alcohol_use, drug_use'

// appointment_id is intentionally excluded: ai_soapnotes has no such column — selecting it
// errors the query, which loadAiSoapForEncounter swallows silently, so SOAP notes always
// came back null instead of throwing visibly.
export const AI_SOAP_SELECT =
  'id, encounter_id, subjective_text, objective_text, assessment_text, plan_text, created_at, updated_at, priority'

export const AI_SOAP_RISK_SELECT =
  'subjective_text, objective_text, assessment_text, plan_text'

export const AI_SOAP_SUBJECTIVE_SELECT = 'subjective_text'

export const DOCTOR_SOAP_SELECT =
  'id, doctor_id, subjective_text, objective_text, assessment_text, plan_text, created_at, updated_at'

export const ENCOUNTER_ORDER_SELECT =
  'id, encounter_id, patient_id, order_type, title, instructions, status, ordered_by_doctor_id, completed_at, completed_by_uid, created_at, updated_at'

export const DOCTOR_AVAILABILITY_SELECT = 'doctor_id, is_available, updated_at'

// uploaded_by_name is intentionally excluded: patient_documents has no such column — selecting
// it 500s both GET (list) and POST (upload) on app/api/patients/[id]/documents/route.ts. The
// uploader's display name is already resolved separately via a profiles lookup in that route.
export const PATIENT_DOCUMENT_SELECT =
  'id, patient_id, file_name, file_path, file_type, file_size, document_category, uploaded_by, created_at'

export const PRESCRIPTION_LIST_SELECT =
  'id, medication_name, strength, dosage_instruction, dosage, instructions, route, frequency, duration, refills, status, notes, created_at'

export const PRE_SALES_SELECT = 'id, product_id, product_quantity, product_quantity_taken, status'
