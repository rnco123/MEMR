import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PHYSICAL_EXAM_ROW_SELECT,
  normalizeRosExamData,
  physicalExamAuditFromRow,
  physicalExaminationRowToData,
  type PhysicalExamAuditSummary,
  type PhysicalExaminationData,
  type RosExamData,
} from '@/lib/encounter/physical-examination'
import {
  generatePhysicalExaminationPdfBytes,
  physicalExaminationHasChartContent,
  type PhysicalExaminationPdfContext,
} from '@/lib/encounter/generate-physical-examination-pdf'

export const PHYSICAL_EXAMINATION_DOCUMENT_NAME = 'Physical Examination'
export const PHYSICAL_EXAMINATION_DOCUMENT_CATEGORY = 'report' as const

export function physicalExaminationStoragePath(patientId: number): string {
  return `patient-${patientId}/clinical/physical-examination.pdf`
}

export type PhysicalExamChartSyncAction = 'created' | 'updated' | 'removed' | 'skipped'

export type PhysicalExamChartSyncResult = {
  action: PhysicalExamChartSyncAction
  filePath: string | null
}

type LatestPhysicalExamRow = {
  encounter_id: number
  ros_exam_data: unknown
  updated_at: string
  editor_name: string | null
  editor_role: string | null
  general_appearance: string | null
  eyes_ears_nose_throat: string | null
  cardiovascular: string | null
  pulmonary: string | null
  abdomen: string | null
  musculoskeletal: string | null
  neurologic: string | null
  psychiatric: string | null
  skin: string | null
  lymphatic: string | null
  remarks: string | null
}

type EncounterMeta = {
  id: number
  encounter_code: string | null
  ma_exam_findings: string | null
  appointments?: { appointment_date?: string | null } | { appointment_date?: string | null }[] | null
}

export async function loadLatestPatientPhysicalExamination(
  admin: SupabaseClient,
  patientId: number
): Promise<{
  encounter: EncounterMeta
  rosExam: RosExamData
  legacyExam: ReturnType<typeof physicalExaminationRowToData>
  lastAudit: ReturnType<typeof physicalExamAuditFromRow>
} | null> {
  const { data: encounters, error: encErr } = await admin
    .from('encounters')
    .select('id, encounter_code, ma_exam_findings, appointments(appointment_date)')
    .eq('patient_id', patientId)

  if (encErr) throw encErr
  const encounterList = (encounters ?? []) as EncounterMeta[]
  if (encounterList.length === 0) return null

  const encounterById = new Map(encounterList.map((enc) => [enc.id, enc]))
  const encounterIds = encounterList.map((enc) => enc.id)

  const { data: peRow, error: peErr } = await admin
    .from('encounter_physical_examinations')
    .select(PHYSICAL_EXAM_ROW_SELECT)
    .in('encounter_id', encounterIds)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (peErr) throw peErr

  if (peRow) {
    const row = peRow as LatestPhysicalExamRow
    const encounter = encounterById.get(row.encounter_id)
    if (!encounter) return null
    return {
      encounter,
      rosExam: normalizeRosExamData(row.ros_exam_data),
      legacyExam: physicalExaminationRowToData(row as Record<string, unknown>),
      lastAudit: physicalExamAuditFromRow(row as Record<string, unknown>),
    }
  }

  const legacyEncounter = encounterList
    .filter((enc) => enc.ma_exam_findings?.trim())
    .sort((a, b) => b.id - a.id)[0]

  if (!legacyEncounter?.ma_exam_findings?.trim()) return null

  return {
    encounter: legacyEncounter,
    rosExam: {},
    legacyExam: { remarks: legacyEncounter.ma_exam_findings.trim() },
    lastAudit: null,
  }
}

function appointmentDateFromEncounter(encounter: EncounterMeta): string | null {
  const appt = encounter.appointments
  if (!appt) return null
  if (Array.isArray(appt)) return appt[0]?.appointment_date ?? null
  return appt.appointment_date ?? null
}

/** Upsert a single global physical examination PDF on the patient chart (latest encounter wins). */
export async function syncLatestPhysicalExaminationToPatientChart(
  admin: SupabaseClient,
  patientId: number,
  uploadedByUid?: string | null,
  options?: {
    /** Use the row just saved instead of re-querying (avoids stale/mismatched chart PDF). */
    savedSnapshot?: {
      encounterId: number
      rosExam: RosExamData
      lastAudit: NonNullable<PhysicalExamAuditSummary> | null
      legacyExam?: PhysicalExaminationData
    }
  }
): Promise<PhysicalExamChartSyncResult> {
  const filePath = physicalExaminationStoragePath(patientId)
  let latest = await loadLatestPatientPhysicalExamination(admin, patientId)

  if (options?.savedSnapshot) {
    const { data: encounter } = await admin
      .from('encounters')
      .select('id, encounter_code, ma_exam_findings, appointments(appointment_date)')
      .eq('id', options.savedSnapshot.encounterId)
      .maybeSingle()

    if (encounter) {
      latest = {
        encounter: encounter as EncounterMeta,
        rosExam: normalizeRosExamData(options.savedSnapshot.rosExam),
        legacyExam: options.savedSnapshot.legacyExam ?? {},
        lastAudit: options.savedSnapshot.lastAudit,
      }
    }
  }

  if (
    !latest ||
    !physicalExaminationHasChartContent({
      rosExam: latest.rosExam,
      legacyExam: latest.legacyExam,
    })
  ) {
    const { data: existing } = await admin
      .from('patient_documents')
      .select('id')
      .eq('patient_id', patientId)
      .eq('file_path', filePath)
      .maybeSingle()

    if (existing?.id) {
      await admin.from('patient_documents').delete().eq('id', existing.id)
      await admin.storage.from('patient-documents').remove([filePath])
    }
    return { action: 'removed', filePath: null }
  }

  const { data: patient, error: patientErr } = await admin
    .from('patients')
    .select('id, first_name, last_name, date_of_birth')
    .eq('id', patientId)
    .maybeSingle()

  if (patientErr) throw patientErr
  if (!patient) return { action: 'skipped', filePath: null }

  const patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ').trim() || `Patient ${patientId}`

  // Find earliest / 1st encounter visit date for this patient
  const { data: patientEncounters } = await admin
    .from('encounters')
    .select('created_at, appointments(appointment_date)')
    .eq('patient_id', patientId)

  let firstVisitDate: string | null = null
  if (patientEncounters) {
    for (const enc of patientEncounters) {
      const appt = Array.isArray(enc.appointments) ? enc.appointments[0] : enc.appointments
      const d = appt?.appointment_date || enc.created_at
      if (d) {
        if (!firstVisitDate || d.slice(0, 10) < firstVisitDate.slice(0, 10)) {
          firstVisitDate = d
        }
      }
    }
  }

  const pdfContext: PhysicalExaminationPdfContext = {
    patientName,
    patientDob: patient.date_of_birth as string | null | undefined,
    encounterId: latest.encounter.id,
    encounterCode: latest.encounter.encounter_code,
    encounterDate: firstVisitDate ?? appointmentDateFromEncounter(latest.encounter),
    examRecordedAt: latest.lastAudit?.recorded_at ?? null,
    lastAudit: latest.lastAudit,
    rosExam: latest.rosExam,
    legacyExam: latest.legacyExam,
  }

  const pdfBytes = await generatePhysicalExaminationPdfBytes(pdfContext)
  const now = new Date().toISOString()

  const { error: uploadErr } = await admin.storage.from('patient-documents').upload(filePath, pdfBytes, {
    cacheControl: '3600',
    upsert: true,
    contentType: 'application/pdf',
  })
  if (uploadErr) {
    console.error('[physical-examination] patient document upload:', uploadErr.message)
    throw uploadErr
  }

  const { data: existing } = await admin
    .from('patient_documents')
    .select('id')
    .eq('patient_id', patientId)
    .eq('file_path', filePath)
    .maybeSingle()

  const row = {
    patient_id: patientId,
    file_path: filePath,
    file_name: PHYSICAL_EXAMINATION_DOCUMENT_NAME,
    file_type: 'application/pdf',
    file_size: pdfBytes.byteLength,
    document_category: PHYSICAL_EXAMINATION_DOCUMENT_CATEGORY,
    uploaded_by: uploadedByUid ?? null,
    created_at: now,
  }

  if (existing?.id) {
    await admin.from('patient_documents').update(row).eq('id', existing.id)
    return { action: 'updated', filePath }
  }

  await admin.from('patient_documents').insert(row)
  return { action: 'created', filePath }
}
