import type { I693FormData } from '@/lib/i693/types'
import { I693_UI_SECTIONS } from '@/lib/i693/field-sections'

/**
 * Maps digital form keys → USCIS I-693 AcroForm field names.
 * Field names vary by form edition; place fillable PDF at public/forms/i-693-template.pdf
 * and adjust this map to match your PDF's field inspector (Adobe / pdf-lib getFields).
 */
export const I693_ACROFORM_MAP: Record<string, string> = {
  'applicant.family_name': 'Pt1Line1a_FamilyName',
  'applicant.given_name': 'Pt1Line1b_GivenName',
  'applicant.middle_name': 'Pt1Line1c_MiddleName',
  'applicant.in_care_of': 'Pt1Line2_InCareofName',
  'applicant.street': 'Pt1Line2a_StreetNumberName',
  'applicant.apt': 'Pt1Line2b_AptSteFlrNumber',
  'applicant.city': 'Pt1Line2c_CityOrTown',
  'applicant.state': 'Pt1Line2d_State',
  'applicant.zip': 'Pt1Line2e_ZipCode',
  'applicant.date_of_birth': 'Pt1Line3a_DOB',
  'applicant.country_of_birth': 'Pt1Line3b_CountryOfBirth',
  'applicant.a_number': 'Pt1Line4_AlienNumber',
  'civil_surgeon.summary_remarks': 'Pt5Line1_Remarks',
  'civil_surgeon.date_signed': 'Pt5Line2_DateSigned',
}

export function flatFormValues(data: I693FormData): Record<string, string> {
  const out: Record<string, string> = {}
  const root = data as unknown as Record<string, unknown>

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
      if (typeof cur === 'boolean') out[field.key] = cur ? 'Yes' : 'No'
      else out[field.key] = String(cur).trim()
    }
  }

  if (data.applicant.sex === 'male') out['applicant.sex_male'] = 'Yes'
  if (data.applicant.sex === 'female') out['applicant.sex_female'] = 'Yes'

  return out
}

export function applyToPdfForm(
  getTextField: (name: string) => { setText: (t: string) => void } | undefined,
  getCheckBox: (name: string) => { check: () => void } | undefined,
  data: I693FormData
): { filled: string[]; missing: string[] } {
  const values = flatFormValues(data)
  const filled: string[] = []
  const missing: string[] = []

  for (const [path, pdfName] of Object.entries(I693_ACROFORM_MAP)) {
    const val = values[path]
    if (!val) continue
    try {
      const field = getTextField(pdfName)
      if (field) {
        field.setText(val.slice(0, 500))
        filled.push(pdfName)
      } else {
        missing.push(pdfName)
      }
    } catch {
      missing.push(pdfName)
    }
  }

  if (data.applicant.sex === 'male') {
    try {
      getCheckBox('Pt1Line5_Male')?.check()
    } catch {
      /* optional */
    }
  }
  if (data.applicant.sex === 'female') {
    try {
      getCheckBox('Pt1Line5_Female')?.check()
    } catch {
      /* optional */
    }
  }

  return { filled, missing }
}
