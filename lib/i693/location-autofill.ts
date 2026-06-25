import type { SupabaseClient } from '@supabase/supabase-js'
import { parseAddressComponents } from '@/lib/i693/ai-fill'
import { joinPersonName } from '@/lib/i693/pdf-field-slots'
import { defaultVaccinationGrid } from '@/lib/i693/vaccination-grid-map'
import type { I693FormData, I693VaccinationGridRow } from '@/lib/i693/types'
import { mergeI693Form } from '@/lib/i693/types'
import { resolveEffectiveLocationId } from '@/lib/locations/scope'

/** Clinica region label shown under the auto-fill control (Group A/B/C). */
export const LOCATION_GROUP_REGION_LABEL: Record<string, string> = {
  A: 'Dallas',
  B: 'Houston',
  C: 'San Antonio',
}

const CLINICA_I693_GROUPS = new Set(['A', 'B', 'C'])

const CIVIL_SURGEON_SHARED = {
  practice_name: 'CLINICA SAN MIGUEL',
  medical_license: '106645',
  phone: '4698868060',
  email: 'immdallassanmiguel@gmail.com',
  state: 'TX',
  surgeon_given: 'DALLAS',
  surgeon_family: 'ALVEY',
  surgeon_middle: 'JORDAN',
} as const

const VACCINATION_REMARKS: Record<'A' | 'B' | 'C', string> = {
  A: 'IPOL VACCINE 2ND DOSE DUE \rHEP B VACCINE 2ND DOSE DUE \rVARICELLA VACCINE 2ND DOSE DUE \rNOT FLU SEASON',
  B: 'IPOL VACCINE 2nd DOSE DUE\rMMR VACCINE 2nd DOSE DUE\rHEP B VACCINE 2nd DOSE DUE\rVARICELLA VACCINE 2nd DOSE DUE',
  C: 'IPOL VACCINE 2nd DOSE DUE \rHEP B VACCINE 2nd DOSE DUE \rVARICELLA VACCINE 2nd DOSE DUE\rNOT FLU SEASON',
}

/** PDF widgets shared across Clinica sample templates (pages 4, 6, 9, 10, 12, 13). */
const SHARED_PDF_WIDGET_VALUES: Record<string, string> = {
  'form1[0].#subform[3].Pt6Line1_OverallFinding[1]': 'A',
  'form1[0].#subform[3].Pt7Line1_GivenName[0]': CIVIL_SURGEON_SHARED.surgeon_given,
  'form1[0].#subform[3].Pt7Line1_FamilyName[0]': CIVIL_SURGEON_SHARED.surgeon_family,
  'form1[0].#subform[3].Pt7Line1_MiddleName[0]': CIVIL_SURGEON_SHARED.surgeon_middle,
  'form1[0].#subform[5].Pt8Line1A_GammarRelease[1]': 'QF',
  'form1[0].#subform[8].Pt8Line1D1_Findings[0]': 'a',
  'form1[0].#subform[8].Pt8Line2A_Disorders[0]': '1',
  'form1[0].#subform[9].Pt8Line3A_Findings[2]': '1',
  'form1[0].#subform[9].Pt8Line4_ListOtherMedConditions[0]': 'N/A',
  'form1[0].#subform[12].P10_Results[0]': 'A',
}

const SAN_ANTONIO_UNIT_WIDGETS: Record<string, string> = {
  'form1[0].#subform[3].Pt7Line3_Unit[1]': 'STE',
  'form1[0].#subform[3].Pt7Line4_Unit[1]': 'STE',
}

export type I693LocationAutofillMeta = {
  available: boolean
  region_label: string | null
  location_title: string | null
  location_address: string | null
  location_group: string | null
  location_id: number | null
  reason?: string
}

export type I693LocationAutofillResult = I693LocationAutofillMeta & {
  form_data: I693FormData
}

/**
 * Fixed USCIS Part 13 (page 12) layout shared by every Clinica group (A/B/C).
 * Mirrors the standard Clinica blanket-waiver template exactly.
 */
function patchVaccinationGrid(): I693VaccinationGridRow[] {
  const grid = defaultVaccinationGrid()
  const row = (code: string) => {
    let r = grid.find((g) => g.vaccineCode === code)
    if (!r) {
      r = { vaccineCode: code }
      grid.push(r)
    }
    return r
  }

  row('dt').notAgeAppropriate = true
  row('td').givenTdap = true
  row('mmr').completeSeries = true
  row('polio').givenIpv = true
  row('polio').insufficientInterval = true
  row('hib').notAgeAppropriate = true
  row('hep_b').insufficientInterval = true
  row('varicella').insufficientInterval = true
  row('pneumo').notAgeAppropriate = true
  // Influenza row exposes only the "*See Below Table" waiver checkbox.
  row('influenza').insufficientInterval = true

  for (const code of ['hep_a', 'meningococcal', 'rotavirus', 'hpv'] as const) {
    row(code).notAgeAppropriate = true
  }

  return grid
}

function buildLocationAutofillPatch(
  group: 'A' | 'B' | 'C',
  location: {
    title: string | null
    address: string | null
    email: string | null
    phone: string | null
  }
): I693FormData {
  const parsed = location.address
    ? parseAddressComponents(String(location.address), 'TX', '')
    : { street: '', apt: '', city: '', state: 'TX', zip: '', country: '' }

  const pdf_widget_values: Record<string, string> = {
    ...SHARED_PDF_WIDGET_VALUES,
  ...(parsed.apt ? SAN_ANTONIO_UNIT_WIDGETS : {}),
  }

  if (parsed.apt) {
    pdf_widget_values['form1[0].#subform[3].Pt7Line3_AptSteFlrNumber[0]'] = parsed.apt
    pdf_widget_values['form1[0].#subform[3].Pt7Line4_AptSteFlrNumber[0]'] = parsed.apt
  }

  const patch = {
    tb_screening: {
      quantiferon_t_spot: 'QF',
      // Page 7 (6) TB Classification/Findings → "No Class A or Class B TB".
      classification: 'NOClassA',
    },
    syphilis_sti: {
      syphilis_result: 'a',
    },
    other_conditions: {
      conditions: 'N/A',
    },
    civil_surgeon: {
      surgeon_name: joinPersonName(
        CIVIL_SURGEON_SHARED.surgeon_family,
        CIVIL_SURGEON_SHARED.surgeon_given
      ),
      practice_name: CIVIL_SURGEON_SHARED.practice_name,
      street: parsed.street,
      apt: parsed.apt,
      city: parsed.city,
      state: parsed.state || CIVIL_SURGEON_SHARED.state,
      zip: parsed.zip,
      phone: location.phone?.trim() || CIVIL_SURGEON_SHARED.phone,
      email: location.email?.trim() || CIVIL_SURGEON_SHARED.email,
      medical_license: CIVIL_SURGEON_SHARED.medical_license,
      summary_overall: 'class_b',
      vaccinations_complete: true,
      vaccination_remarks: VACCINATION_REMARKS[group],
    },
    vaccination_grid: patchVaccinationGrid(),
    pdf_widget_values,
  } as Partial<I693FormData>

  return mergeI693Form(patch)
}

export async function resolveI693LocationAutofill(
  admin: SupabaseClient,
  encounterId: number
): Promise<I693LocationAutofillResult> {
  const unavailable = (
    reason: string,
    extra: Partial<I693LocationAutofillMeta> = {}
  ): I693LocationAutofillResult => ({
    available: false,
    region_label: null,
    location_title: null,
    location_address: null,
    location_group: null,
    location_id: null,
    reason,
    form_data: mergeI693Form(undefined),
    ...extra,
  })

  const { data: enc, error: encErr } = await admin
    .from('encounters')
    .select(
      `
      id,
      patient_id,
      appointments:appointment_id ( location_id ),
      patients:patient_id ( location_id )
    `
    )
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr || !enc) return unavailable('Encounter not found')

  const appt = Array.isArray(enc.appointments) ? enc.appointments[0] : enc.appointments
  const patient = Array.isArray(enc.patients) ? enc.patients[0] : enc.patients
  const locationId = resolveEffectiveLocationId(
    patient?.location_id as number | null | undefined,
    appt?.location_id as number | null | undefined
  )

  if (locationId == null) {
    return unavailable('Patient location is not assigned')
  }

  const { data: loc, error: locErr } = await admin
    .from('locations')
    .select('id, title, address, email, phone, location_group')
    .eq('id', locationId)
    .maybeSingle()

  if (locErr || !loc) return unavailable('Location not found', { location_id: locationId })

  const group = String(loc.location_group ?? '')
    .trim()
    .toUpperCase()

  if (!CLINICA_I693_GROUPS.has(group)) {
    const regionLabel = LOCATION_GROUP_REGION_LABEL[group] ?? null
    return unavailable('Location auto-fill is only available for Clinica groups A, B, and C', {
      location_id: locationId,
      location_title: loc.title ?? null,
      location_address: loc.address ?? null,
      location_group: group || null,
      region_label: regionLabel,
    })
  }

  const typedGroup = group as 'A' | 'B' | 'C'
  const regionLabel = LOCATION_GROUP_REGION_LABEL[typedGroup] ?? group

  return {
    available: true,
    region_label: regionLabel,
    location_title: loc.title ?? null,
    location_address: loc.address ?? null,
    location_group: typedGroup,
    location_id: locationId,
    form_data: buildLocationAutofillPatch(typedGroup, {
      title: loc.title ?? null,
      address: loc.address ?? null,
      email: loc.email ?? null,
      phone: loc.phone ?? null,
    }),
  }
}
