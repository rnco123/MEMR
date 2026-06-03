import type { I693FormData, I693VaccinationGridRow } from '@/lib/i693/types'
import { mergeI693Form } from '@/lib/i693/types'

function hasValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(hasValue)
  if (typeof value === 'object') return Object.values(value).some(hasValue)
  return String(value).trim().length > 0
}

function mergeObjectValues<T extends Record<string, unknown>>(current: T, draft: Partial<T>): T {
  const next = { ...current }
  for (const [key, value] of Object.entries(draft)) {
    if (!hasValue(value)) continue
    next[key as keyof T] = value as T[keyof T]
  }
  return next
}

function mergeVaccinationGrid(
  current: I693VaccinationGridRow[],
  draft: I693VaccinationGridRow[]
): I693VaccinationGridRow[] {
  const byCode = new Map(current.map((row) => [row.vaccineCode, { ...row }]))
  for (const draftRow of draft) {
    if (!draftRow.vaccineCode) continue
    const existing = byCode.get(draftRow.vaccineCode) ?? { vaccineCode: draftRow.vaccineCode }
    byCode.set(draftRow.vaccineCode, mergeObjectValues(existing, draftRow))
  }
  return Array.from(byCode.values())
}

/**
 * Applies an accepted supporting-document AI draft without letting blank draft
 * fields erase work already present in the default I-693 editor.
 */
export function mergeAcceptedI693AiDraft(
  currentForm: I693FormData,
  draftForm: I693FormData
): I693FormData {
  const current = mergeI693Form(currentForm)
  const draft = mergeI693Form(draftForm)

  const next: I693FormData = {
    ...current,
    applicant: mergeObjectValues(current.applicant, draft.applicant),
    application: mergeObjectValues(current.application, draft.application),
    uscis_records: mergeObjectValues(current.uscis_records, draft.uscis_records),
    applicant_contact: mergeObjectValues(current.applicant_contact, draft.applicant_contact),
    interpreter: mergeObjectValues(current.interpreter, draft.interpreter),
    preparer: mergeObjectValues(current.preparer, draft.preparer),
    medical_history: mergeObjectValues(current.medical_history, draft.medical_history),
    tb_screening: mergeObjectValues(current.tb_screening, draft.tb_screening),
    syphilis_sti: mergeObjectValues(current.syphilis_sti, draft.syphilis_sti),
    physical_mental: mergeObjectValues(current.physical_mental, draft.physical_mental),
    drug_abuse: mergeObjectValues(current.drug_abuse, draft.drug_abuse),
    other_conditions: mergeObjectValues(current.other_conditions, draft.other_conditions),
    civil_surgeon: mergeObjectValues(current.civil_surgeon, draft.civil_surgeon),
    vaccinations: draft.vaccinations.some(hasValue) ? draft.vaccinations : current.vaccinations,
    vaccination_grid: mergeVaccinationGrid(current.vaccination_grid, draft.vaccination_grid),
    pdf_widget_values: {
      ...(current.pdf_widget_values ?? {}),
      ...(draft.pdf_widget_values ?? {}),
    },
  }

  if (Object.keys(next.pdf_widget_values ?? {}).length === 0) {
    delete next.pdf_widget_values
  }

  return mergeI693Form(next)
}
