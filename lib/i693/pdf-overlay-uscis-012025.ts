/**
 * Hand-calibrated overlay coordinates for USCIS Form I-693 Edition 01/20/25.
 * PDF origin: bottom-left. `y` = top edge of the fill box (distance from page bottom).
 * Mirror pages (applicant header) are in pdf-overlay-mirrors.ts.
 */
export type PdfTextPlacement = {
  key: string
  page: number
  x: number
  y: number
  size?: number
  width?: number
  maxWidth?: number
  format?: 'date' | 'text'
  slot?: 'name_family' | 'name_given' | 'phone_day' | 'phone_mobile'
}

export type PdfCharCellPlacement = {
  key: string
  page: number
  x: number
  y: number
  count: number
  cellWidth: number
  mode?: 'digit' | 'alnum'
}

export type PdfMarkPlacement = {
  key: string
  page: number
  x: number
  y: number
  when: string
}

export const I693_OVERLAY_TEXT: PdfTextPlacement[] = [
  // Part 1 — page 0 (y = fill-box top, gap 10pt below label)
  { key: 'applicant.family_name', page: 0, x: 56, y: 590, size: 9, width: 210 },
  { key: 'applicant.given_name', page: 0, x: 272, y: 590, size: 9, width: 168 },
  { key: 'applicant.middle_name', page: 0, x: 446, y: 590, size: 9, width: 120 },
  { key: 'applicant.in_care_of', page: 0, x: 56, y: 536, size: 9, width: 504 },
  { key: 'applicant.street', page: 0, x: 56, y: 500, size: 9, width: 352 },
  { key: 'applicant.apt', page: 0, x: 416, y: 500, size: 8, width: 90 },
  { key: 'applicant.city', page: 0, x: 56, y: 464, size: 9, width: 352 },
  { key: 'applicant.state', page: 0, x: 416, y: 464, size: 9, width: 54 },
  { key: 'applicant.zip', page: 0, x: 476, y: 464, size: 9, width: 72 },
  { key: 'applicant.province', page: 0, x: 56, y: 429, size: 9, width: 180 },
  { key: 'applicant.postal_code', page: 0, x: 242, y: 429, size: 9, width: 96 },
  { key: 'applicant.country', page: 0, x: 344, y: 429, size: 9, width: 216 },
  { key: 'applicant.date_of_birth', page: 0, x: 200, y: 374, size: 9, width: 144, format: 'date' },
  { key: 'applicant.city_of_birth', page: 0, x: 351, y: 374, size: 9, width: 200 },
  { key: 'applicant.country_of_birth', page: 0, x: 73, y: 339, size: 9, width: 200 },

  // Part 2 contact — page 1 (bottom of sheet)
  { key: 'applicant_contact.day_phone', page: 1, x: 56, y: 622, size: 9, width: 264 },
  { key: 'applicant_contact.mobile_phone', page: 1, x: 332, y: 622, size: 9, width: 216 },
  { key: 'applicant_contact.email', page: 1, x: 56, y: 586, size: 8, width: 492 },
  { key: 'applicant_contact.applicant_signature_date', page: 1, x: 446, y: 376, size: 9, width: 120, format: 'date' },

  // Part 3 interpreter — page 1
  {
    key: 'interpreter.interpreter_name',
    page: 1,
    x: 56,
    y: 274,
    size: 9,
    width: 264,
    slot: 'name_family',
  },
  {
    key: 'interpreter.interpreter_name',
    page: 1,
    x: 326,
    y: 274,
    size: 9,
    width: 264,
    slot: 'name_given',
  },
  { key: 'interpreter.interpreter_organization', page: 1, x: 56, y: 238, size: 9, width: 504 },
  {
    key: 'interpreter.interpreter_phone',
    page: 1,
    x: 56,
    y: 172,
    size: 9,
    width: 264,
    slot: 'phone_day',
  },
  {
    key: 'interpreter.interpreter_phone',
    page: 1,
    x: 344,
    y: 172,
    size: 9,
    width: 216,
    slot: 'phone_mobile',
  },
  { key: 'interpreter.interpreter_email', page: 1, x: 56, y: 136, size: 8, width: 492 },

  // Part 4 preparer — page 2
  {
    key: 'preparer.preparer_name',
    page: 2,
    x: 56,
    y: 478,
    size: 9,
    width: 264,
    slot: 'name_family',
  },
  {
    key: 'preparer.preparer_name',
    page: 2,
    x: 326,
    y: 478,
    size: 9,
    width: 264,
    slot: 'name_given',
  },
  { key: 'preparer.preparer_organization', page: 2, x: 56, y: 442, size: 9, width: 504 },
  {
    key: 'preparer.preparer_phone',
    page: 2,
    x: 56,
    y: 376,
    size: 9,
    width: 264,
    slot: 'phone_day',
  },
  {
    key: 'preparer.preparer_phone',
    page: 2,
    x: 344,
    y: 376,
    size: 9,
    width: 216,
    slot: 'phone_mobile',
  },
  { key: 'preparer.preparer_email', page: 2, x: 56, y: 340, size: 8, width: 492 },
  { key: 'preparer.preparer_signature_date', page: 2, x: 446, y: 220, size: 9, width: 120, format: 'date' },
  { key: 'interpreter.interpreter_signature_date', page: 2, x: 446, y: 220, size: 9, width: 120, format: 'date' },

  // Part 6 summary + Part 7 civil surgeon — page 3
  { key: 'civil_surgeon.date_signed', page: 3, x: 56, y: 598, size: 9, width: 120, format: 'date' },
  {
    key: 'civil_surgeon.surgeon_name',
    page: 3,
    x: 56,
    y: 466,
    size: 9,
    width: 210,
    slot: 'name_family',
  },
  {
    key: 'civil_surgeon.surgeon_name',
    page: 3,
    x: 278,
    y: 466,
    size: 9,
    width: 150,
    slot: 'name_given',
  },
  { key: 'civil_surgeon.practice_name', page: 3, x: 56, y: 358, size: 9, width: 504 },
  { key: 'civil_surgeon.medical_license', page: 3, x: 209, y: 395, size: 9, width: 360 },
  { key: 'civil_surgeon.street', page: 3, x: 56, y: 292, size: 9, width: 352 },
  { key: 'civil_surgeon.city', page: 3, x: 56, y: 256, size: 9, width: 352 },
  { key: 'civil_surgeon.state', page: 3, x: 416, y: 256, size: 9, width: 54 },
  { key: 'civil_surgeon.zip', page: 3, x: 476, y: 256, size: 9, width: 72 },
  { key: 'civil_surgeon.phone', page: 3, x: 56, y: 89, size: 9, width: 264 },
  { key: 'civil_surgeon.email', page: 3, x: 302, y: 89, size: 8, width: 246 },

  // Part 8 worksheet — page 5
  { key: 'tb_screening.classification', page: 5, x: 56, y: 659, size: 8, width: 500 },
  { key: 'tb_screening.quantiferon_t_spot', page: 5, x: 56, y: 629, size: 8, width: 240 },
  { key: 'syphilis_sti.syphilis_result', page: 5, x: 56, y: 599, size: 8, width: 220 },
  { key: 'syphilis_sti.gonorrhea_result', page: 5, x: 302, y: 599, size: 8, width: 220 },
]

/** Page 0 only — USCIS account + A-number digit boxes. */
export const I693_OVERLAY_CHAR_CELLS: PdfCharCellPlacement[] = [
  { key: 'applicant.uscis_online_account', page: 0, x: 92, y: 303, count: 12, cellWidth: 13.2, mode: 'alnum' },
  { key: 'applicant.a_number', page: 0, x: 404, y: 339, count: 9, cellWidth: 12.6, mode: 'digit' },
]

export const I693_OVERLAY_MARKS: PdfMarkPlacement[] = [
  { key: 'applicant.sex', page: 0, x: 88, y: 359, when: 'male' },
  { key: 'applicant.sex', page: 0, x: 136, y: 359, when: 'female' },
  { key: 'application.immigration_benefit', page: 0, x: 92, y: 248, when: 'vaccination_only' },
  { key: 'civil_surgeon.summary_overall', page: 3, x: 74, y: 652, when: 'none' },
  { key: 'civil_surgeon.summary_overall', page: 3, x: 74, y: 634, when: 'class_b' },
  { key: 'civil_surgeon.summary_overall', page: 3, x: 74, y: 616, when: 'class_a' },
]
