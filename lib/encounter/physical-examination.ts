import type { EncounterStatus } from '@/lib/encounter-status'

// ── ROS / Physical Exam structured checkbox data ─────────────────────────────

/** Per-system status for ROS or physical exam rows. */
export type SystemStatus = 'N' | 'A' | 'NA' | null

/** Review of Systems (left column of the PE form). */
export type RosData = {
  cons?: SystemStatus          // Constitutional
  skin?: SystemStatus
  eyes?: SystemStatus
  ears?: SystemStatus
  nose?: SystemStatus
  throat?: SystemStatus
  cv_resp?: SystemStatus       // CV / Respiratory
  gi?: SystemStatus
  gu?: SystemStatus
  gyn?: SystemStatus
  gyn_lmp?: string | null      // LMP free-text
  male?: SystemStatus
  ms?: SystemStatus
  neu?: SystemStatus
  neu_numbness?: string | null
  neu_tingling?: string | null
  psych?: SystemStatus
  hemat_lymph?: SystemStatus
}

/** Physical Examination systems (right column of the PE form). */
export type ExamData = {
  general?: SystemStatus
  skin?: SystemStatus
  head?: SystemStatus
  eyes?: SystemStatus
  ears?: SystemStatus
  nose?: SystemStatus
  throat?: SystemStatus
  neck?: SystemStatus
  cv?: SystemStatus
  respir?: SystemStatus
  abdomen?: SystemStatus
  gu?: SystemStatus
  rectal?: SystemStatus
  ms?: SystemStatus
  ms_sites?: string | null     // Exam sites free-text
  neuro?: SystemStatus
}

/** Top-level payload stored as JSONB in ros_exam_data column. */
export type RosExamData = {
  ros?: RosData
  exam?: ExamData
  remarks?: string | null
}

export function normalizeRosExamData(raw: unknown): RosExamData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as RosExamData
}

export function formatRosExamForContext(data: RosExamData | null | undefined): string | null {
  if (!data) return null
  const lines: string[] = []
  const rosRows: Array<[string, SystemStatus | undefined]> = [
    ['Constitutional', data.ros?.cons],
    ['Skin (ROS)', data.ros?.skin],
    ['Eyes (ROS)', data.ros?.eyes],
    ['Ears (ROS)', data.ros?.ears],
    ['Nose (ROS)', data.ros?.nose],
    ['Throat (ROS)', data.ros?.throat],
    ['CV/Resp (ROS)', data.ros?.cv_resp],
    ['GI', data.ros?.gi],
    ['GU', data.ros?.gu],
    ['GYN', data.ros?.gyn],
    ['Male (ROS)', data.ros?.male],
    ['MS (ROS)', data.ros?.ms],
    ['Neurologic (ROS)', data.ros?.neu],
    ['Psychiatric (ROS)', data.ros?.psych],
    ['Hemat/Lymph', data.ros?.hemat_lymph],
  ]
  for (const [label, status] of rosRows) {
    if (status) lines.push(`${label}: ${status}`)
  }
  if (data.ros?.gyn_lmp) lines.push(`  LMP: ${data.ros.gyn_lmp}`)
  if (data.ros?.neu_numbness) lines.push(`  Numbness: ${data.ros.neu_numbness}`)
  if (data.ros?.neu_tingling) lines.push(`  Tingling: ${data.ros.neu_tingling}`)

  const examRows: Array<[string, SystemStatus | undefined]> = [
    ['General', data.exam?.general],
    ['Skin (Exam)', data.exam?.skin],
    ['Head', data.exam?.head],
    ['Eyes (Exam)', data.exam?.eyes],
    ['Ears (Exam)', data.exam?.ears],
    ['Nose (Exam)', data.exam?.nose],
    ['Throat (Exam)', data.exam?.throat],
    ['Neck', data.exam?.neck],
    ['CV (Exam)', data.exam?.cv],
    ['Respiratoy', data.exam?.respir],
    ['Abdomen', data.exam?.abdomen],
    ['GU (Exam)', data.exam?.gu],
    ['Rectal', data.exam?.rectal],
    ['MS (Exam)', data.exam?.ms],
    ['Neuro', data.exam?.neuro],
  ]
  for (const [label, status] of examRows) {
    if (status) lines.push(`${label}: ${status}`)
  }
  if (data.exam?.ms_sites) lines.push(`  MS Exam sites: ${data.exam.ms_sites}`)
  if (data.remarks) lines.push(`Remarks: ${data.remarks}`)
  return lines.length ? lines.join('\n') : null
}

// ── Legacy flat text fields ────────────────────────────────────────────────

/** Structured IMM / I-693 Part 7 style physical examination (nurse-entered). */
export type PhysicalExaminationData = {
  height?: string | null
  weight?: string | null
  bmi?: string | null
  blood_pressure?: string | null
  pulse?: string | null
  temperature?: string | null
  general_appearance?: string | null
  eyes_ears_nose_throat?: string | null
  cardiovascular?: string | null
  pulmonary?: string | null
  abdomen?: string | null
  musculoskeletal?: string | null
  neurologic?: string | null
  psychiatric?: string | null
  skin?: string | null
  lymphatic?: string | null
  remarks?: string | null
}

export type PhysicalExamAuditSummary = {
  editor_name: string | null
  editor_role: string | null
  updated_at: string
} | null

export const PHYSICAL_EXAM_ROW_SELECT =
  'encounter_id, ros_exam_data, general_appearance, eyes_ears_nose_throat, cardiovascular, pulmonary, abdomen, musculoskeletal, neurologic, psychiatric, skin, lymphatic, remarks, edited_by, editor_role, editor_name, created_at, updated_at'

/** Vitals-style measurements — stored on the row for legacy data; not edited in the PE form. */
export const PHYSICAL_EXAM_VITALS_KEYS = [
  'height',
  'weight',
  'bmi',
  'blood_pressure',
  'pulse',
  'temperature',
] as const satisfies readonly (keyof PhysicalExaminationData)[]

export const PHYSICAL_EXAM_SYSTEM_KEYS = [
  'general_appearance',
  'eyes_ears_nose_throat',
  'cardiovascular',
  'pulmonary',
  'abdomen',
  'musculoskeletal',
  'neurologic',
  'psychiatric',
  'skin',
  'lymphatic',
] as const satisfies readonly (keyof PhysicalExaminationData)[]

/** Fields shown and saved from the encounter modal physical exam panel. */
export const PHYSICAL_EXAM_FORM_KEYS = [
  ...PHYSICAL_EXAM_SYSTEM_KEYS,
  'remarks',
] as const satisfies readonly (keyof PhysicalExaminationData)[]

export type PhysicalExamFieldKey =
  | (typeof PHYSICAL_EXAM_SYSTEM_KEYS)[number]
  | 'remarks'

export const PHYSICAL_EXAM_FIELD_LABEL_KEYS: Record<PhysicalExamFieldKey, string> = {
  general_appearance: 'encounter_modal.pe_general_appearance',
  eyes_ears_nose_throat: 'encounter_modal.pe_heent',
  cardiovascular: 'encounter_modal.pe_cardiovascular',
  pulmonary: 'encounter_modal.pe_pulmonary',
  abdomen: 'encounter_modal.pe_abdomen',
  musculoskeletal: 'encounter_modal.pe_musculoskeletal',
  neurologic: 'encounter_modal.pe_neurologic',
  psychiatric: 'encounter_modal.pe_psychiatric',
  skin: 'encounter_modal.pe_skin',
  lymphatic: 'encounter_modal.pe_lymphatic',
  remarks: 'encounter_modal.pe_remarks',
}

const EDITABLE_STATUSES: EncounterStatus[] = [
  'appointment_initiated',
  'provider_assigned',
  'vitals_assessed',
  'in_consultation',
]

const EDITOR_ROLES = new Set(['nurse', 'staff'])

export function canEditPhysicalExamination(
  status: string | null | undefined,
  role: string | null | undefined
): boolean {
  if (!status || !role || !EDITOR_ROLES.has(role)) return false
  return EDITABLE_STATUSES.includes(status as EncounterStatus)
}

export function isPhysicalExaminationLocked(status: string | null | undefined): boolean {
  if (!status) return true
  return !EDITABLE_STATUSES.includes(status as EncounterStatus)
}

export function normalizePhysicalExamination(raw: unknown): PhysicalExaminationData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: PhysicalExaminationData = {}
  const keys = PHYSICAL_EXAM_FORM_KEYS
  for (const key of keys) {
    const v = src[key]
    if (v == null) continue
    const s = String(v).trim()
    if (s) out[key] = s
  }
  return out
}

export function physicalExaminationFromLegacyFindings(
  findings: string | null | undefined
): PhysicalExaminationData {
  const text = findings?.trim()
  if (!text) return {}
  return { remarks: text }
}

export function mergePhysicalExamination(
  stored: unknown,
  legacyFindings?: string | null
): PhysicalExaminationData {
  const normalized = normalizePhysicalExamination(stored)
  if (Object.keys(normalized).length > 0) return normalized
  return physicalExaminationFromLegacyFindings(legacyFindings)
}

export function formatPhysicalExaminationForContext(data: PhysicalExaminationData | null | undefined): string | null {
  if (!data) return null
  const lines: string[] = []
  for (const key of PHYSICAL_EXAM_SYSTEM_KEYS) {
    const v = data[key]
    if (v) lines.push(`${key.replace(/_/g, ' ')}: ${v}`)
  }
  if (data.remarks) lines.push(`Remarks: ${data.remarks}`)
  return lines.length ? lines.join('\n') : null
}

export const PHYSICAL_EXAM_DATA_KEYS = PHYSICAL_EXAM_FORM_KEYS

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed || null
}

export function physicalExaminationRowToData(row: Record<string, unknown> | null): PhysicalExaminationData {
  if (!row) return {}
  const out: PhysicalExaminationData = {}
  for (const key of PHYSICAL_EXAM_DATA_KEYS) {
    const v = row[key]
    if (v == null) continue
    const s = String(v).trim()
    if (s) out[key] = s
  }
  return out
}

export function physicalExaminationDataToRow(data: PhysicalExaminationData): Record<string, string | null> {
  const row: Record<string, string | null> = {}
  for (const key of PHYSICAL_EXAM_DATA_KEYS) {
    row[key] = emptyToNull(data[key] ?? null)
  }
  return row
}

export function physicalExamAuditFromRow(row: Record<string, unknown> | null): PhysicalExamAuditSummary {
  if (!row?.updated_at) return null
  return {
    editor_name: (row.editor_name as string | null) ?? null,
    editor_role: (row.editor_role as string | null) ?? null,
    updated_at: String(row.updated_at),
  }
}
