/** USCIS I-693 widget short names (from MuPDF) → MEMR form keys */

export type WidgetSlot = 'name_family' | 'name_given' | 'phone_day' | 'phone_mobile'

export type WidgetCheckboxBinding = {
  key: string
  when: string
  /** Widget short name + index, e.g. Pt1Line3_Gender + 0 */
  widget: string
  index: number
}

/** Text/combobox widgets: short name (without [n]) → form key + optional slot */
export const WIDGET_TEXT_TO_KEY: Record<string, { key: string; slot?: WidgetSlot; format?: 'date' }> = {
  Pt1Line1a_FamilyName: { key: 'applicant.family_name' },
  Pt1Line1b_GivenName: { key: 'applicant.given_name' },
  Pt1Line1c_MiddleName: { key: 'applicant.middle_name' },
  Pt1Line2_StreetNumberName: { key: 'applicant.street' },
  Pt1Line2_AptSteFlrNumber: { key: 'applicant.apt' },
  P1Line2_CityOrTown: { key: 'applicant.city' },
  P1Line2_State: { key: 'applicant.state' },
  P1Line2_ZipCode: { key: 'applicant.zip' },
  P1Line2_Province: { key: 'applicant.province' },
  P1Line2_PostalCode: { key: 'applicant.postal_code' },
  P1Line2_Country: { key: 'applicant.country' },
  Pt1Line3_DateOfBirth: { key: 'applicant.date_of_birth', format: 'date' },
  Pt1Line3_CityTownVillageofBirth: { key: 'applicant.city_of_birth' },
  Pt1Line3_CountryofBirth: { key: 'applicant.country_of_birth' },
  Pt1Line3e_AlienNumber: { key: 'applicant.a_number' },
  Pt1Line3f_USCISOnlineAcctNumber: { key: 'applicant.uscis_online_account' },

  Pt2Line3_DaytimePhone: { key: 'applicant_contact.day_phone' },
  Pt2Line4_Mobilephone: { key: 'applicant_contact.mobile_phone' },
  Pt2Line5_EmailAddress: { key: 'applicant_contact.email' },
  Pt2Line6_DateofSignature: { key: 'applicant_contact.applicant_signature_date', format: 'date' },

  Pt3Line1_InterpreterFamilyName: { key: 'interpreter.interpreter_name', slot: 'name_family' },
  Pt3Line1_InterpreterGivenName: { key: 'interpreter.interpreter_name', slot: 'name_given' },
  Pt3Line2_NameofBusinessorOrgName: { key: 'interpreter.interpreter_organization' },
  Pt3Line4_DaytimePhone: { key: 'interpreter.interpreter_phone', slot: 'phone_day' },
  Pt3Line5_MobilePhone: { key: 'interpreter.interpreter_phone', slot: 'phone_mobile' },
  Pt3Line6_EmailAddress: { key: 'interpreter.interpreter_email' },
  Pt3Line7_DateofSignature: { key: 'interpreter.interpreter_signature_date', format: 'date' },

  Pt4Line1_PreparerFamilyName: { key: 'preparer.preparer_name', slot: 'name_family' },
  Pt4Line1_PreparerGivenName: { key: 'preparer.preparer_name', slot: 'name_given' },
  Pt4Line2_PreparerNameofBusinessorOrgName: { key: 'preparer.preparer_organization' },
  Pt4Line3_DaytimePhone: { key: 'preparer.preparer_phone', slot: 'phone_day' },
  Pt4Line4_MobilePhone: { key: 'preparer.preparer_phone', slot: 'phone_mobile' },
  Pt4Line5_EmailAddress: { key: 'preparer.preparer_email' },
  Pt4Line8_DateofSignature: { key: 'preparer.preparer_signature_date', format: 'date' },

  Pt6Line2_DateoExam: { key: 'civil_surgeon.date_signed', format: 'date' },
  Pt7Line1_FamilyName: { key: 'civil_surgeon.surgeon_name', slot: 'name_family' },
  Pt7Line1_GivenName: { key: 'civil_surgeon.surgeon_name', slot: 'name_given' },
  Pt7Line1_MiddleName: { key: 'civil_surgeon.surgeon_name' },
  Pt7Line2_MedPracticeName: { key: 'civil_surgeon.practice_name' },
  Pt7Line1_CivilSurgeonID: { key: 'civil_surgeon.medical_license' },
  Pt7Line3_StreetNumberName: { key: 'civil_surgeon.street' },
  Pt7Line3_AptSteFlrNumber: { key: 'civil_surgeon.apt' },
  Pt7Line3_CityOrTown: { key: 'civil_surgeon.city' },
  Pt7Line3_State: { key: 'civil_surgeon.state' },
  Pt7Line3_ZipCode: { key: 'civil_surgeon.zip' },
  Pt7Line4_StreetNumberName: { key: 'civil_surgeon.street' },
  Pt7Line4_AptSteFlrNumber: { key: 'civil_surgeon.apt' },
  Pt7Line4_CityOrTown: { key: 'civil_surgeon.city' },
  Pt7Line4_ZipCode: { key: 'civil_surgeon.zip' },
  Pt7Line4_State: { key: 'civil_surgeon.state' },
  Pt7Line5_DaytimePhone: { key: 'civil_surgeon.phone' },
  Pt7Line6_MobilePhone: { key: 'civil_surgeon.phone', slot: 'phone_mobile' },
  Pt7Line7_EmailAddress: { key: 'civil_surgeon.email' },
  Pt7Line8_DateofSignature: { key: 'civil_surgeon.date_signed', format: 'date' },
  Pt6Line3_DateofExam1: { key: 'civil_surgeon.date_signed', format: 'date' },
  Pt6Line3_DateofExam2: { key: 'civil_surgeon.date_signed', format: 'date' },
  Pt6Line3_DateofExam3: { key: 'civil_surgeon.date_signed', format: 'date' },
  P10_Remarks: { key: 'civil_surgeon.vaccination_remarks' },
  P10_USCIS_Remarks: { key: 'civil_surgeon.summary_remarks' },

  Pt8Line1A1_TSDate: { key: 'tb_screening.quantiferon_t_spot' },
  Pt8Line1A1_QFDate: { key: 'tb_screening.quantiferon_t_spot' },
  Pt8Line1B1c_SyphilisScreen: { key: 'syphilis_sti.syphilis_result' },
}

/** Second street line on Part 1 is "in care of" in the 01/20/25 PDF. */
export const WIDGET_STREET_IN_CARE_OF_INDEX = 1

export const WIDGET_CHECKBOX_BINDINGS: WidgetCheckboxBinding[] = [
  { widget: 'Pt1Line3_Gender', index: 0, key: 'applicant.sex', when: 'male' },
  { widget: 'Pt1Line3_Gender', index: 1, key: 'applicant.sex', when: 'female' },
  { widget: 'Pt1_Line4_ImmMedExamReq', index: 0, key: 'application.immigration_benefit', when: 'vaccination_only' },
  { widget: 'Pt6Line1_OverallFinding', index: 0, key: 'civil_surgeon.summary_overall', when: 'none' },
  { widget: 'Pt6Line1_OverallFinding', index: 1, key: 'civil_surgeon.summary_overall', when: 'class_b' },
  { widget: 'Pt6Line1_OverallFinding', index: 2, key: 'civil_surgeon.summary_overall', when: 'class_a' },
  { widget: 'P10_Results', index: 0, key: 'civil_surgeon.vaccinations_complete', when: 'Yes' },
  { widget: 'P10_Results', index: 1, key: 'civil_surgeon.vaccinations_complete', when: 'No' },
  // Page 7 (6) TB Classification/Findings — single-select checkbox group.
  { widget: 'Pt8Line1A6_TBClassification', index: 0, key: 'tb_screening.classification', when: 'NOClassA' },
  { widget: 'Pt8Line1A6_TBClassification', index: 1, key: 'tb_screening.classification', when: 'CA' },
  { widget: 'Pt8Line1A6_TBClassification', index: 2, key: 'tb_screening.classification', when: 'B1Pul' },
  { widget: 'Pt8Line1A6_TBClassification', index: 3, key: 'tb_screening.classification', when: 'B0' },
  { widget: 'Pt8Line1A6_TBClassification', index: 4, key: 'tb_screening.classification', when: 'B1Extrapul' },
  { widget: 'Pt8Line1A6_TBClassification', index: 5, key: 'tb_screening.classification', when: 'B2 TB Latent' },
  { widget: 'Pt8Line1A6_TBClassification', index: 6, key: 'tb_screening.classification', when: 'Class B Other Chest ' },
]

export function widgetShortName(fullName: string): string {
  const leaf = fullName.split('.').pop() ?? fullName
  const bracket = leaf.indexOf('[')
  return bracket === -1 ? leaf : leaf.slice(0, bracket)
}

export function widgetFieldIndex(fullName: string): number {
  const m = /\[(\d+)\]\s*$/.exec(fullName.split('.').pop() ?? '')
  return m ? Number(m[1]) : 0
}

export function isIgnoredWidget(fullName: string): boolean {
  const short = widgetShortName(fullName)
  return short.includes('BarCode') || short.includes('PDF417')
}
