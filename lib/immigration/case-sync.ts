import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeI693Form, type I693FormData } from '@/lib/i693/types'
import {
  isImmigrationEncounterForI693,
  ENCOUNTER_I693_ELIGIBILITY_SELECT,
  resolveEncounterPatientId,
} from '@/lib/i693/immigration-eligibility'
import {
  IMMIGRATION_PROGRAM,
  type ImmigrationCaseRow,
  type ImmigrationStatusColor,
  type ImmigrationWorkflowStatus,
} from '@/lib/immigration/types'
import {
  isAllowedByLocationScope,
  resolveEffectiveLocationId,
  type LocationScope,
} from '@/lib/locations/scope'

export type CaseFlags = {
  is_lab_complete: boolean
  is_vaccine_complete: boolean
  is_intake_complete: boolean
  is_md_signed: boolean
  is_i693_exported: boolean
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

function firstObject<T extends Record<string, unknown>>(value: unknown): T | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') return value[0] as T
  return null
}

function readNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function deriveCaseFlags(
  admin: SupabaseClient,
  encounterId: number,
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
  const is_i693_exported = i693Status === 'exported'
  const is_md_signed =
    hasText(form.civil_surgeon.date_signed) ||
    i693Status === 'reviewed' ||
    is_i693_exported

  return {
    is_intake_complete,
    is_lab_complete,
    is_vaccine_complete,
    is_md_signed,
    is_i693_exported,
    is_delivered: existingDelivered,
  }
}

const TASK_TYPES = ['intake', 'tb_lab', 'xray', 'vaccine_record', 'md_signature'] as const

const WORKFLOW_STATUS_ORDER: Record<ImmigrationWorkflowStatus, number> = {
  incomplete: 0,
  ready_review: 1,
  completed: 2,
  doctor_reviewed: 3,
  delivered: 4,
}

function workflowStatusColor(status: ImmigrationWorkflowStatus): ImmigrationStatusColor {
  switch (status) {
    case 'delivered':
      return 'blue'
    case 'completed':
      return 'green'
    case 'doctor_reviewed':
      return 'purple'
    case 'ready_review':
      return 'yellow'
    default:
      return 'red'
  }
}

type ImmigrationCaseWriteRow = {
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
  status_updated_by?: string | null
  status_updated_by_name?: string | null
  status_updated_at?: string | null
  updated_at: string
}

function isPgError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === code
}

function isMissingStatusMoverColumnError(err: unknown): boolean {
  if (!isPgError(err, 'PGRST204')) return false
  const message = String((err as { message?: string }).message ?? '')
  return (
    message.includes('status_updated_at') ||
    message.includes('status_updated_by') ||
    message.includes('status_updated_by_name')
  )
}

function withoutStatusMoverMetadata(row: ImmigrationCaseWriteRow): ImmigrationCaseWriteRow {
  const { status_updated_by: _a, status_updated_by_name: _b, status_updated_at: _c, ...rest } = row
  return rest
}

async function saveImmigrationCaseRowAttempt(
  admin: SupabaseClient,
  row: ImmigrationCaseWriteRow
): Promise<ImmigrationCaseRow> {
  const { data: updated, error: updateError } = await admin
    .from('immigration_cases')
    .update(row)
    .eq('encounter_id', row.encounter_id)
    .select()
    .maybeSingle()

  if (updateError) throw updateError
  if (updated) return updated as ImmigrationCaseRow

  const { data: inserted, error: insertError } = await admin
    .from('immigration_cases')
    .insert(row)
    .select()
    .single()

  if (!insertError && inserted) return inserted as ImmigrationCaseRow

  if (isPgError(insertError, '23505')) {
    const { data: retry, error: retryError } = await admin
      .from('immigration_cases')
      .update(row)
      .eq('encounter_id', row.encounter_id)
      .select()
      .single()
    if (retryError) throw retryError
    return retry as ImmigrationCaseRow
  }

  if (insertError) throw insertError
  throw new Error(`Failed to save immigration case for encounter ${row.encounter_id}`)
}

/** Update-first save avoids duplicate-key races from parallel list syncs. */
async function saveImmigrationCaseRow(
  admin: SupabaseClient,
  row: ImmigrationCaseWriteRow
): Promise<ImmigrationCaseRow> {
  try {
    return await saveImmigrationCaseRowAttempt(admin, row)
  } catch (err) {
    if (!isMissingStatusMoverColumnError(err)) throw err
    console.warn(
      '[syncImmigrationCase] status_updated_* columns missing — apply migration 063_i693_status_mover_metadata.sql'
    )
    return saveImmigrationCaseRowAttempt(admin, withoutStatusMoverMetadata(row))
  }
}

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

  const now = new Date().toISOString()
  const rows = TASK_TYPES.map((taskType) => {
    const isComplete = completed.has(taskType)
    const isMissing = missing_items.includes(taskType)
    const status = isComplete && !isMissing ? 'completed' : 'pending'
    return {
      case_id: caseId,
      task_type: taskType,
      status,
      completed_at: status === 'completed' ? now : null,
      updated_at: now,
    }
  })

  const { error } = await admin
    .from('immigration_tasks')
    .upsert(rows, { onConflict: 'case_id,task_type' })
  if (error) {
    console.warn('[syncImmigrationCase] immigration_tasks upsert failed:', error.message)
  }
}

/** Upsert immigration_cases row and recompute status from chart data. */
export async function syncImmigrationCase(
  admin: SupabaseClient,
  encounterId: number,
  options?: {
    manualStatus?: ImmigrationWorkflowStatus
    /** When true, ignore a prior manual Kanban move and recompute status from checklist flags. */
    forceRecomputeStatus?: boolean
    statusUpdatedByUserId?: string | null
    statusUpdatedByName?: string | null
    is_delivered?: boolean
    delivery_type?: string | null
    delivery_date?: string | null
    notes?: string | null
  }
): Promise<ImmigrationCaseRow | null> {
  const { data: enc, error: encErr } = await admin
    .from('encounters')
    .select(ENCOUNTER_I693_ELIGIBILITY_SELECT)
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!enc || !isImmigrationEncounterForI693(enc)) return null

  const patientId = resolveEncounterPatientId(enc)
  if (!patientId) return null

  const encounterPatientId = Number(enc.patient_id)
  if (!Number.isFinite(encounterPatientId) || encounterPatientId <= 0) {
    await admin
      .from('encounters')
      .update({ patient_id: patientId, updated_at: new Date().toISOString() })
      .eq('id', encounterId)
  }

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
  const flags = await deriveCaseFlags(admin, encounterId, Boolean(priorDelivered))

  if (options?.is_delivered === true) flags.is_delivered = true

  let status: ImmigrationWorkflowStatus
  let status_color: ImmigrationStatusColor
  let missing_items: string[]

  if (options?.manualStatus) {
    const computed = computeWorkflowFromFlags(flags)
    status = options.manualStatus
    status_color = workflowStatusColor(status)
    missing_items = computed.missing_items
    if (status === 'delivered') flags.is_delivered = true
    if (status === 'doctor_reviewed' || status === 'completed' || status === 'delivered') {
      flags.is_md_signed = true
    }
  } else if (existing && !options?.forceRecomputeStatus) {
    const computed = computeWorkflowFromFlags(flags)
    const existingOrder = WORKFLOW_STATUS_ORDER[existing.status as ImmigrationWorkflowStatus] ?? 0
    const computedOrder = WORKFLOW_STATUS_ORDER[computed.status] ?? 0
    const manuallyMoved = Boolean(existing.status_updated_by)
    const advancedOnBoard = existingOrder > computedOrder
    if (manuallyMoved || advancedOnBoard) {
      status = existing.status as ImmigrationWorkflowStatus
      status_color = existing.status_color as ImmigrationStatusColor
      missing_items = computed.missing_items
    } else {
      status = computed.status
      status_color = computed.status_color
      missing_items = computed.missing_items
    }
  } else {
    const computed = computeWorkflowFromFlags(flags)
    status = computed.status
    status_color = computed.status_color
    missing_items = computed.missing_items
  }

  const now = new Date().toISOString()
  const statusChanged = Boolean(
    options?.manualStatus && (!existing || existing.status !== options.manualStatus)
  )
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
    ...(statusChanged
      ? {
          status_updated_by: options?.statusUpdatedByUserId ?? null,
          status_updated_by_name: options?.statusUpdatedByName ?? null,
          status_updated_at: now,
        }
      : {}),
    updated_at: now,
  }

  const caseRow = await saveImmigrationCaseRow(admin, row)

  await syncTasks(admin, caseRow.id, missing_items, flags)
  return caseRow
}

type ListImmigrationCasesOptions = {
  scope?: LocationScope
  locationFilterIds?: number[]
}

type ListImmigrationCasesResult = Awaited<ReturnType<typeof listImmigrationCasesInner>>

let listImmigrationCasesInflight: Promise<ListImmigrationCasesResult> | null = null

/** Coalesce parallel /api/i693/cases requests so sync does not run twice at once. */
export async function listImmigrationCases(
  admin: SupabaseClient,
  options: ListImmigrationCasesOptions = {}
): Promise<ListImmigrationCasesResult> {
  if (options.scope || options.locationFilterIds?.length) {
    return listImmigrationCasesInner(admin, options)
  }

  if (listImmigrationCasesInflight) {
    return listImmigrationCasesInflight
  }
  listImmigrationCasesInflight = listImmigrationCasesInner(admin, options).finally(() => {
    listImmigrationCasesInflight = null
  })
  return listImmigrationCasesInflight
}

async function listImmigrationCasesInner(
  admin: SupabaseClient,
  options: ListImmigrationCasesOptions
): Promise<
  {
    encounter_id: number
    patient_id: number
    patient_name: string
    appointment_date: string | null
    appointment_time: string | null
    location_id: number | null
    location_title: string | null
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
      patients:patient_id ( first_name, last_name, location_id ),
      appointments:appointment_id (
        patient_id,
        location_id,
        appointment_date,
        appointment_time,
        services:service_id ( title_en, title_es ),
        patients:patient_id ( first_name, last_name, location_id )
      )
    `
    )
    .order('updated_at', { ascending: false })
    .limit(300)

  if (error) throw error

  const immigration = (encounters ?? []).filter((e) => isImmigrationEncounterForI693(e))
  const encounterIds = immigration.map((e) => Number((e as { id: number }).id)).filter((id) => id > 0)

  const [{ data: caseRows }, { data: submissions }] = await Promise.all([
    encounterIds.length > 0
      ? admin.from('immigration_cases').select('*').in('encounter_id', encounterIds)
      : Promise.resolve({ data: [] as ImmigrationCaseRow[] }),
    encounterIds.length > 0
      ? admin.from('i693_submissions').select('encounter_id, status').in('encounter_id', encounterIds)
      : Promise.resolve({ data: [] as { encounter_id: number; status: string }[] }),
  ])

  const caseByEncounter = new Map(
    (caseRows ?? []).map((row) => [Number(row.encounter_id), row as ImmigrationCaseRow])
  )
  const i693StatusByEncounter = new Map(
    (submissions ?? []).map((row) => [Number(row.encounter_id), String(row.status)])
  )

  const locationIds = new Set<number>()
  for (const e of immigration) {
    const raw = e as Record<string, unknown>
    const patient = firstObject<{ location_id?: unknown }>(raw.patients)
    const appt = firstObject<{ location_id?: unknown; patients?: unknown }>(raw.appointments)
    const apptPatient = firstObject<{ location_id?: unknown }>(appt?.patients)
    const effectiveLocationId = resolveEffectiveLocationId(
      readNumber(patient?.location_id ?? apptPatient?.location_id),
      readNumber(appt?.location_id)
    )
    if (effectiveLocationId != null) locationIds.add(effectiveLocationId)
  }

  const locationTitleById = new Map<number, string>()
  if (locationIds.size > 0) {
    const { data: locations } = await admin
      .from('locations')
      .select('id, title')
      .in('id', [...locationIds])
    for (const loc of locations ?? []) {
      locationTitleById.set(Number(loc.id), String(loc.title ?? ''))
    }
  }

  const defaultCaseRow = (patientId: number, encounterId: number): ImmigrationCaseRow => ({
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
    status_updated_by: null,
    status_updated_by_name: null,
    status_updated_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  const results: ListImmigrationCasesResult = []
  const missingCaseEncounterIds: number[] = []

  for (const e of immigration) {
    const raw = e as Record<string, unknown>
    const encounterId = Number(raw.id)
    const patientId = resolveEncounterPatientId(e as Parameters<typeof resolveEncounterPatientId>[0])
    if (!patientId) {
      console.warn(`[listImmigrationCases] skipping encounter ${encounterId}: no patient_id`)
      continue
    }

    const patientFromEncounter = firstObject<{
      first_name?: string
      last_name?: string
      location_id?: unknown
    }>(raw.patients)
    const appt = firstObject<{
      appointment_date?: string | null
      appointment_time?: string | null
      location_id?: unknown
      patients?: unknown
    }>(raw.appointments)
    const patientFromAppointment = firstObject<{
      first_name?: string
      last_name?: string
      location_id?: unknown
    }>(appt?.patients)

    const patient = patientFromEncounter ?? patientFromAppointment
    const effectiveLocationId = resolveEffectiveLocationId(
      readNumber(patientFromEncounter?.location_id ?? patientFromAppointment?.location_id),
      readNumber(appt?.location_id)
    )

    if (
      options.locationFilterIds?.length &&
      (effectiveLocationId == null || !options.locationFilterIds.includes(effectiveLocationId))
    ) {
      continue
    }

    if (options.scope && !isAllowedByLocationScope(options.scope, effectiveLocationId)) {
      continue
    }

    const storedCase = caseByEncounter.get(encounterId)
    const caseRow = storedCase ?? defaultCaseRow(patientId, encounterId)
    if (!storedCase) missingCaseEncounterIds.push(encounterId)

    results.push({
      encounter_id: encounterId,
      patient_id: patientId,
      patient_name: patient
        ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim()
        : `Patient #${patientId}`,
      appointment_date: appt?.appointment_date ?? null,
      appointment_time: appt?.appointment_time ?? null,
      location_id: effectiveLocationId,
      location_title: effectiveLocationId != null ? locationTitleById.get(effectiveLocationId) ?? null : null,
      case: caseRow,
      i693_status: i693StatusByEncounter.get(encounterId) ?? null,
    })
  }

  void syncMissingImmigrationCasesInBackground(admin, missingCaseEncounterIds)

  return results
}

/** Create/sync case rows for encounters missing from immigration_cases (non-blocking). */
function syncMissingImmigrationCasesInBackground(
  admin: SupabaseClient,
  encounterIds: number[]
): void {
  if (encounterIds.length === 0) return
  void (async () => {
    for (const encounterId of encounterIds.slice(0, 25)) {
      try {
        await syncImmigrationCase(admin, encounterId)
      } catch (err) {
        console.warn(`[listImmigrationCases] background sync failed for encounter ${encounterId}:`, err)
      }
    }
  })()
}
