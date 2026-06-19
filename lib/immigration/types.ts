export const IMMIGRATION_PROGRAM = 'immigration_i693' as const

export type ImmigrationWorkflowStatus =
  | 'incomplete'
  | 'ready_review'
  | 'completed'
  | 'doctor_reviewed'
  | 'delivered'
export type ImmigrationStatusColor = 'red' | 'yellow' | 'purple' | 'green' | 'blue'

export type ImmigrationCaseRow = {
  id: number
  patient_id: number
  encounter_id: number
  status: ImmigrationWorkflowStatus
  status_color: ImmigrationStatusColor
  missing_items: string[]
  is_lab_complete: boolean
  is_vaccine_complete: boolean
  is_intake_complete: boolean
  is_md_signed: boolean
  is_delivered: boolean
  delivery_type: string | null
  delivery_date: string | null
  notes: string | null
  status_updated_by: string | null
  status_updated_by_name: string | null
  status_updated_at: string | null
  created_at: string
  updated_at: string
}

export type ImmigrationCaseListItem = ImmigrationCaseRow & {
  patient_name: string
  appointment_date: string | null
  appointment_time: string | null
  i693_status: string | null
}

export const WORKFLOW_COLUMNS: {
  status: ImmigrationWorkflowStatus
  color: ImmigrationStatusColor
  emoji: string
  labelKey: string
}[] = [
  { status: 'incomplete', color: 'red', emoji: '🔴', labelKey: 'i693.wf_incomplete' },
  { status: 'ready_review', color: 'yellow', emoji: '🟡', labelKey: 'i693.wf_ready_review' },
  { status: 'completed', color: 'green', emoji: '🟢', labelKey: 'i693.wf_completed' },
  { status: 'doctor_reviewed', color: 'purple', emoji: '🟣', labelKey: 'i693.wf_doctor_reviewed' },
  { status: 'delivered', color: 'blue', emoji: '🔵', labelKey: 'i693.wf_delivered' },
]

export const MISSING_ITEM_LABELS: Record<string, string> = {
  intake: 'Intake',
  tb_lab: 'TB lab',
  xray: 'Chest X-ray',
  vaccine_record: 'Vaccine record',
  md_signature: 'MD signature',
  delivery: 'Delivery',
}
