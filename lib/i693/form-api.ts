import type { I693FormData } from '@/lib/i693/types'
import { mergeI693Form } from '@/lib/i693/types'
import { I693_UI_SECTIONS } from '@/lib/i693/field-sections'

/** Pull form_data from GET/POST API JSON (several response shapes). */
export function extractFormDataFromApi(json: unknown): unknown {
  if (json == null || typeof json !== 'object') return null
  const o = json as Record<string, unknown>

  if (o.form_data != null) return o.form_data

  const data = o.data
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    const row = data as Record<string, unknown>
    if (row.form_data != null) return row.form_data
    if (
      row.applicant != null ||
      row.medical_examination != null ||
      row.tb_screening != null ||
      row.civil_surgeon != null
    ) {
      return row
    }
  }

  if (o.applicant != null || o.medical_examination != null || o.tb_screening != null) {
    return o
  }

  return null
}

export function countFilledI693Fields(form: I693FormData): number {
  let n = 0
  const root = form as unknown as Record<string, unknown>
  for (const section of I693_UI_SECTIONS) {
    for (const field of section.fields) {
      const parts = field.key.split('.')
      let cur: unknown = root
      for (const p of parts) {
        if (cur == null || typeof cur !== 'object') {
          cur = undefined
          break
        }
        cur = (cur as Record<string, unknown>)[p]
      }
      if (cur == null || cur === '') continue
      if (typeof cur === 'boolean' && cur === false) {
        n++
        continue
      }
      if (typeof cur === 'boolean' && cur === true) {
        n++
        continue
      }
      n++
    }
  }
  for (const v of form.vaccinations) {
    if (v.vaccine_name?.trim() || v.date_given?.trim()) n++
  }
  return n
}

export function parseFormDataFromApi(raw: unknown): I693FormData {
  if (raw == null) return mergeI693Form(undefined)
  if (typeof raw === 'string') {
    try {
      return mergeI693Form(JSON.parse(raw) as Partial<I693FormData>)
    } catch {
      return mergeI693Form(undefined)
    }
  }
  return mergeI693Form(raw as Partial<I693FormData>)
}
