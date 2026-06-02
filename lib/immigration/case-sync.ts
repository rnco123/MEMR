import type { SupabaseClient } from '@supabase/supabase-js'
import { isImmigrationEncounter, mergeI693Form, type I693FormData } from '@/lib/i693/types'
import {
  IMMIGRATION_PROGRAM,
  type ImmigrationCaseRow,
  type ImmigrationStatusColor,
  type ImmigrationWorkflowStatus,
} from '@/lib/immigration/types'

export type CaseFlags = {
  is_lab_complete: boolean
  is_vaccine_complete: boolean
  is_intake_complete: boolean
  is_md_signed: boolean
  is_delivered: boolean
}

/** Auto status from checklist flags (per I-693 workflow spec). */
export function computeWorkflowFromFlags(flags: CaseFlags): {
  status: ImmigrationWorkflowStatus
  status_color: ImmigrationStatusColor
  missing_items: string[]
} {
  const missing: string[] = []
  if (!flags.is_intake_complete) missing.push('intake')
  if (!flags.is_lab_complete) missing.push('tb_lab')
  if (!flags.is_vaccine_complete) missing.push('vaccine_record')

  if (flags.is_delivered) {
    return { status: 'delivered', status_color: 'blue', missing_items: missing }
  }

  if (
    !flags.is_lab_complete ||
    !flags.is_vaccine_complete ||
    !flags.is_intake_complete
  ) {
    return { status: 'incomplete', status_color: 'red', missing_items: missing }
  }

  if (!flags.is_md_signed) {
    if (!missing.includes('md_signature')) missing.push('md_signature')
    return { status: 'ready_review', status_color: 'yellow', missing_items: missing }
  }

  return { status: 'completed', status_color: 'green', missing_items: missing }
}

function hasText(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

export async function deriveCaseFlags(
  admin: SupabaseClient,
  encounterId: number,
  patientId: number,
  existingDelivered: boolean
): Promise<CaseFlags> {
  const { data: enc } = await admin
    .from('encounters')
    .select('id, intake_id, appointment_id')
    .eq('id', encounterId)
    .maybeSingle()

  let is_intake_complete = false
  if (enc?.intake_id) {
    const { data: intake } = await admin.from('intake_form').select('id').eq('id', enc.intake_id).maybeSingle()
    is_intake_complete = Boolean(intake)
  }
  if (!is_intake_complete && enc?.appointment_id) {
    const { data: intakeAppt } = await admin
      .from('intake_form')
      .select('id')
      .eq('appointment_id', enc.appointment_id)
      .maybeSingle()
    is_intake_complete = Boolean(intakeAppt)
  }

  const { data: labOrders } = await admin
    .from('encounter_orders')
    .select('id, status, order_type')
    .eq('encounter_id', encounterId)
    .in('order_type', ['lab_draw', 'poc_test'])

  const labOrderDone = (labOrders ?? []).some((o) => String(o.status) === 'completed')

  const { data: i693 } = await admin
    .from('i693_submissions')
    .select('form_data, status')
    .eq('encounter_id', encounterId)
    .maybeSingle()

  const form = mergeI693Form((i693?.form_data as Partial<I693FormData>) ?? undefined)
  const tbFilled =
    hasText(form.tb_screening.quantiferon_t_spot) ||
    hasText(form.tb_screening.tuberculin_skin_test) ||
    hasText(form.tb_screening.chest_xray) ||
    hasText(form.tb_screening.classification)
  const stiFilled = hasText(form.syphilis_sti.syphilis_result) || hasText(form.syphilis_sti.gonorrhea_result)

  const is_lab_complete = labOrderDone || (tbFilled && stiFilled)

  const immOrders = (labOrders ?? []).filter((o) => String(o.order_type) === 'immunization')
  const immDone = immOrders.some((o) => String(o.status) === 'completed')
  const is_vaccine_complete =
    immDone ||
    form.vaccinations.length > 0 ||
    form.civil_surgeon.vaccinations_complete === true

  const i693Status = String(i693?.status ?? '')
  const is_md_signed =
    hasText(form.civil_surgeon.date_signed) ||
    i693Status === 'reviewed' ||
    i693Status === 'exported'

  return {
    is_intake_complete,
    is_lab_complete,
    is_vaccine_complete,
    is_md_signed,
    is_delivered: existingDelivered,
  }
}

const TASK_TYPES = ['intake', 'tb_lab', 'xray', 'vaccine_record', 'md_signature'] as const

async function syncTasks(
  admin: SupabaseClient,
  caseId: number,
  missing_items: string[],
  flags: CaseFlags
): Promise<void> {
  const completed = new Set<string>()
  if (flags.is_intake_complete) completed.add('intake')
  if (flags.is_lab_complete) {
    completed.add('tb_lab')
    completed.add('xray')
  }
  if (flags.is_vaccine_complete) completed.add('vaccine_record')
  if (flags.is_md_signed) completed.add('md_signature')

  for (const taskType of TASK_TYPES) {
    const isComplete = completed.has(taskType)
    const isMissing = missing_items.includes(taskType)
    const status = isComplete && !isMissing ? 'completed' : 'pending'
    const now = new Date().toISOString()
    await admin.from('immigration_tasks').upsert(
      {
        case_id: caseId,
        task_type: taskType,
        status,
        completed_at: status === 'completed' ? now : null,
        updated_at: now,
      },
      { onConflict: 'case_id,task_type' }
    )
  }
}

/** Upsert immigration_cases row and recompute status from chart data. */
export async function syncImmigrationCase(
  admin: SupabaseClient,
  encounterId: number,
  options?: {
    manualStatus?: ImmigrationWorkflowStatus
    is_delivered?: boolean
    delivery_type?: string | null
    delivery_date?: string | null
    notes?: string | null
  }
): Promise<ImmigrationCaseRow | null> {
  const { data: enc, error: encErr } = await admin
    .from('encounters')
    .select('id, patient_id, consent_ack, program_type')
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!enc || !isImmigrationEncounter(enc.consent_ack)) return null

  const patientId = Number(enc.patient_id)
  if (!Number.isFinite(patientId)) return null

  if (enc.program_type !== IMMIGRATION_PROGRAM) {
    await admin
      .from('encounters')
      .update({ program_type: IMMIGRATION_PROGRAM, updated_at: new Date().toISOString() })
      .eq('id', encounterId)
  }

  const { data: existing } = await admin
    .from('immigration_cases')
    .select('*')
    .eq('encounter_id', encounterId)
    .maybeSingle()

  const priorDelivered = options?.is_delivered ?? existing?.is_delivered ?? false
  const flags = await deriveCaseFlags(admin, encounterId, patientId, Boolean(priorDelivered))

  if (options?.is_delivered === true) flags.is_delivered = true

  let status: ImmigrationWorkflowStatus
  let status_color: ImmigrationStatusColor
  let missing_items: string[]

  if (options?.manualStatus) {
    const computed = computeWorkflowFromFlags(flags)
    status = options.manualStatus
    status_color =
      status === 'delivered'
        ? 'blue'
        : status === 'completed'
          ? 'green'
          : status === 'ready_review'
            ? 'yellow'
            : 'red'
    missing_items = computed.missing_items
    if (status === 'delivered') flags.is_delivered = true
    if (status === 'completed' || status === 'delivered') flags.is_md_signed = true
  } else {
    const computed = computeWorkflowFromFlags(flags)
    status = computed.status
    status_color = computed.status_color
    missing_items = computed.missing_items
  }

  const now = new Date().toISOString()
  const row = {
    patient_id: patientId,
    encounter_id: encounterId,
    status,
    status_color,
    missing_items,
    is_lab_complete: flags.is_lab_complete,
    is_vaccine_complete: flags.is_vaccine_complete,
    is_intake_complete: flags.is_intake_complete,
    is_md_signed: flags.is_md_signed,
    is_delivered: flags.is_delivered,
    delivery_type: options?.delivery_type ?? existing?.delivery_type ?? null,
    delivery_date: options?.delivery_date ?? existing?.delivery_date ?? null,
    notes: options?.notes ?? existing?.notes ?? null,
    updated_at: now,
  }

  let caseRow: ImmigrationCaseRow
  if (existing?.id) {
    const { data, error } = await admin
      .from('immigration_cases')
      .update(row)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    caseRow = data as ImmigrationCaseRow
  } else {
    const { data, error } = await admin.from('immigration_cases').insert(row).select().single()
    if (error) throw error
    caseRow = data as ImmigrationCaseRow
  }

  await syncTasks(admin, caseRow.id, missing_items, flags)
  return caseRow
}

export async function listImmigrationCases(admin: SupabaseClient): Promise<
  {
    encounter_id: number
    patient_id: number
    patient_name: string
    appointment_date: string | null
    appointment_time: string | null
    case: ImmigrationCaseRow | null
    i693_status: string | null
  }[]
> {
  const { data: encounters, error } = await admin
    .from('encounters')
    .select(
      `
      id,
      patient_id,
      appointment_id,
      consent_ack,
      program_type,
      updated_at,
      patients:patient_id ( first_name, last_name ),
      appointments:appointment_id ( appointment_date, appointment_time )
    `
    )
    .order('updated_at', { ascending: false })
    .limit(300)

  if (error) throw error

  const immigration = (encounters ?? []).filter((e) =>
    isImmigrationEncounter((e as { consent_ack?: unknown }).consent_ack)
  )

  const results: Awaited<ReturnType<typeof listImmigrationCases>> = []

  for (const e of immigration) {
    const raw = e as Record<string, unknown>
    const encounterId = Number(raw.id)
    const patientId = Number(raw.patient_id)
    const patientsRaw = raw.patients
    const patient =
      patientsRaw && typeof patientsRaw === 'object' && !Array.isArray(patientsRaw)
        ? (patientsRaw as { first_name?: string; last_name?: string })
        : Array.isArray(patientsRaw) && patientsRaw[0]
          ? (patientsRaw[0] as { first_name?: string; last_name?: string })
          : null
    const apptRaw = raw.appointments
    const appt =
      apptRaw && typeof apptRaw === 'object' && !Array.isArray(apptRaw)
        ? (apptRaw as { appointment_date?: string | null; appointment_time?: string | null })
        : Array.isArray(apptRaw) && apptRaw[0]
          ? (apptRaw[0] as { appointment_date?: string | null; appointment_time?: string | null })
          : null

    let caseRow: ImmigrationCaseRow | null = null
    try {
      caseRow = await syncImmigrationCase(admin, encounterId)
    } catch (syncErr) {
      console.error(`[listImmigrationCases] sync failed for encounter ${encounterId}:`, syncErr)
      caseRow = {
        id: 0,
        patient_id: patientId,
        encounter_id: encounterId,
        status: 'incomplete',
        status_color: 'red',
        missing_items: ['intake'],
        is_lab_complete: false,
        is_vaccine_complete: false,
        is_intake_complete: false,
        is_md_signed: false,
        is_delivered: false,
        delivery_type: null,
        delivery_date: null,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    }

    const { data: sub } = await admin
      .from('i693_submissions')
      .select('status')
      .eq('encounter_id', encounterId)
      .maybeSingle()

    results.push({
      encounter_id: encounterId,
      patient_id: patientId,
      patient_name: patient
        ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim()
        : `Patient #${patientId}`,
      appointment_date: appt?.appointment_date ?? null,
      appointment_time: appt?.appointment_time ?? null,
      case: caseRow,
      i693_status: sub?.status ? String(sub.status) : null,
    })
  }

  return results
}
