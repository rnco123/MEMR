/**
 * USCIS I-693 Part 13 vaccination table — normalized grid ↔ PDF widget short names.
 * Edition 01/20/25 line order (Pt10LineN).
 */
import type { I693FormData, I693VaccinationGridRow } from '@/lib/i693/types'
import { formatDateForPdfDisplay } from '@/lib/i693/pdf-editor-layout'

/** PDF table row number → vaccineCode */
export const VACCINE_LINE_TO_CODE: Record<number, string> = {
  1: 'dt',
  2: 'td',
  // Template line order: OPV/IPV (polio) precedes MMR on page 12.
  3: 'polio',
  4: 'mmr',
  5: 'hib',
  6: 'hep_b',
  7: 'varicella',
  8: 'pneumo',
  9: 'influenza',
  10: 'hep_a',
  11: 'meningococcal',
  12: 'rotavirus',
  13: 'hpv',
}

export const VACCINE_CODE_TO_LINE: Record<string, number> = Object.fromEntries(
  Object.entries(VACCINE_LINE_TO_CODE).map(([line, code]) => [code, Number(line)])
)

export type VaccinationWidgetField =
  | 'dateGiven'
  | 'dateReceived'
  | 'datesReceived'
  | 'completeSeries'
  | 'contraindicated'
  | 'insufficientInterval'
  | 'notAgeAppropriate'
  | 'immune'
  | 'historyOfDisease'
  | 'vaccineGiven'

type ParsedVaxWidget = {
  vaccineCode: string
  field: VaccinationWidgetField
  doseIndex: number
}

const LINE_PREFIX = /^Pt10Line(\d+)/

/**
 * The USCIS template reuses one field name for non-contiguous Complete Series
 * rows. Dedicated fields cover DT, Td, Hepatitis B, and COVID-19.
 */
const COMPLETE_SERIES_LINE_BY_WIDGET_INDEX = [3, 4, 5, 7, 8, 9, 11, 12] as const

/** Parse vaccination-table widget short names (not barcode / Part 14 remarks). */
export function parseVaccinationWidget(short: string): ParsedVaxWidget | null {
  if (
    short.startsWith('P10_Remarks') ||
    short.startsWith('P10_USCIS') ||
    short.startsWith('P10_Results') ||
    short.startsWith('PDF417')
  ) {
    return null
  }

  const dtReceived = /^Pt10Line1_DTDateReceived(\d)$/.exec(short)
  if (dtReceived) {
    return { vaccineCode: 'dt', field: 'datesReceived', doseIndex: Number(dtReceived[1]) }
  }
  if (short === 'Pt10Line1_DTDateGiven') {
    return { vaccineCode: 'dt', field: 'dateGiven', doseIndex: 0 }
  }
  if (short === 'Pt10Line1_DTCompleteSeries') {
    return { vaccineCode: 'dt', field: 'completeSeries', doseIndex: 0 }
  }

  const tdReceived = /^Pt10Line2_TdDateReceived(\d)$/.exec(short)
  if (tdReceived) {
    return { vaccineCode: 'td', field: 'datesReceived', doseIndex: Number(tdReceived[1]) }
  }
  if (short === 'Pt10Line2_TdDateGiven') {
    return { vaccineCode: 'td', field: 'dateGiven', doseIndex: 0 }
  }
  if (short === 'Pt10Line2_TdCompleteSeries') {
    return { vaccineCode: 'td', field: 'completeSeries', doseIndex: 0 }
  }

  const hbReceived = /^Pt10Line6_HBDateReceived(\d)$/.exec(short)
  if (hbReceived) {
    return { vaccineCode: 'hep_b', field: 'datesReceived', doseIndex: Number(hbReceived[1]) }
  }
  if (short === 'Pt10Line6_HBDateGiven') {
    return { vaccineCode: 'hep_b', field: 'dateGiven', doseIndex: 0 }
  }
  if (short === 'Pt10Line1_HBCompleteSeries') {
    return { vaccineCode: 'hep_b', field: 'completeSeries', doseIndex: 0 }
  }
  if (short === 'Pt7Line1_CompleteSeries') {
    return { vaccineCode: 'hep_a', field: 'completeSeries', doseIndex: 0 }
  }

  const lineDose = /^Pt10Line(\d+)([a-d])_DateReceived_(\d)$/.exec(short)
  if (lineDose) {
    const line = Number(lineDose[1])
    const code = VACCINE_LINE_TO_CODE[line]
    if (!code) return null
    return {
      vaccineCode: code,
      field: 'datesReceived',
      doseIndex: Number(lineDose[3]),
    }
  }

  const contraLine = /^Pt10Line(\d+)_ContraCheckBox\d+$/.exec(short)
  if (contraLine) {
    const line = Number(contraLine[1])
    const code = VACCINE_LINE_TO_CODE[line]
    if (code) return { vaccineCode: code, field: 'contraindicated', doseIndex: 0 }
  }
  if (short === 'Pt10Line2_TdContra') {
    return { vaccineCode: 'td', field: 'contraindicated', doseIndex: 0 }
  }

  const notAgeLine = /^Pt10Line(\d+)_NotAge\d+$/.exec(short)
  if (notAgeLine) {
    const line = Number(notAgeLine[1])
    const code = VACCINE_LINE_TO_CODE[line]
    if (code) return { vaccineCode: code, field: 'notAgeAppropriate', doseIndex: 0 }
  }

  const insufLine = /^Pt10Line(\d+)_InsufficientCheckBox\d+$/.exec(short)
  if (insufLine) {
    const line = Number(insufLine[1])
    const code = VACCINE_LINE_TO_CODE[line]
    if (code) return { vaccineCode: code, field: 'insufficientInterval', doseIndex: 0 }
  }

  const lineMatch = LINE_PREFIX.exec(short)
  if (!lineMatch) {
    if (short === 'P9_TDVaccineCheckBox' || short === 'P10_TDVaccineCheckBox') {
      return { vaccineCode: 'td', field: 'vaccineGiven', doseIndex: 0 }
    }
    if (short === 'Pt10_PVVaccineCheckBox') {
      return { vaccineCode: 'polio', field: 'vaccineGiven', doseIndex: 0 }
    }
    if (short.startsWith('P10_VaccineCheckBox')) {
      return null
    }
    return null
  }

  const line = Number(lineMatch[1])
  const code = VACCINE_LINE_TO_CODE[line]
  if (!code) return null

  if (short === `Pt10Line${line}_DateGiven_1` || short === `Pt10Line${line}_DateGiven`) {
    return { vaccineCode: code, field: 'dateGiven', doseIndex: 0 }
  }
  const receivedNum = new RegExp(`^Pt10Line${line}([a-d])_DateReceived_(\\d)$`).exec(short)
  if (receivedNum) {
    return {
      vaccineCode: code,
      field: 'datesReceived',
      doseIndex: Number(receivedNum[2]),
    }
  }
  // Support simple dateReceived patterns without dose index suffix (e.g., Pt10Line7_DateReceived)
  if (short === `Pt10Line${line}_DateReceived` || short === `Pt10Line${line}a_DateReceived`) {
    return { vaccineCode: code, field: 'dateReceived', doseIndex: 1 }
  }
  if (short.includes(`Pt10Line${line}_ContraCheckBox`)) {
    return { vaccineCode: code, field: 'contraindicated', doseIndex: 0 }
  }
  if (short.includes(`Pt10Line${line}_InsufficientCheckBox`)) {
    return { vaccineCode: code, field: 'insufficientInterval', doseIndex: 0 }
  }
  if (short.includes(`Pt10Line${line}_NotAge`)) {
    return { vaccineCode: code, field: 'notAgeAppropriate', doseIndex: 0 }
  }
  if (short.includes('InfluVaccineInsufficient')) {
    return { vaccineCode: 'influenza', field: 'insufficientInterval', doseIndex: 0 }
  }
  if (short.includes('CompleteSeries')) {
    return { vaccineCode: code, field: 'completeSeries', doseIndex: 0 }
  }
  if (short.includes(`Pt10Line${line}_ImmuneCheckBox`) || short.includes(`Pt10Line${line}_Immune`)) {
    return { vaccineCode: code, field: 'immune', doseIndex: 0 }
  }
  if (short.includes(`Pt10Line${line}_HistoryOfDiseaseCheckBox`) || short.includes(`Pt10Line${line}_HistoryOfDisease`)) {
    return { vaccineCode: code, field: 'historyOfDisease', doseIndex: 0 }
  }

  return null
}

/** Parse a widget whose vaccine row also depends on its repeated-field index. */
export function parseVaccinationWidgetAtIndex(
  short: string,
  widgetIndex = 0
): ParsedVaxWidget | null {
  if (short === 'Pt10Line1_CompleteSeries') {
    const line = COMPLETE_SERIES_LINE_BY_WIDGET_INDEX[widgetIndex]
    const vaccineCode = line == null ? undefined : VACCINE_LINE_TO_CODE[line]
    return vaccineCode ? { vaccineCode, field: 'completeSeries', doseIndex: 0 } : null
  }
  return parseVaccinationWidget(short)
}

export function isVaccinationTableWidget(short: string): boolean {
  return parseVaccinationWidget(short) != null || short === 'Pt10Line1_CompleteSeries'
}

export function defaultVaccinationGrid(): I693VaccinationGridRow[] {
  return Object.values(VACCINE_LINE_TO_CODE).map((vaccineCode) => ({
    vaccineCode,
  }))
}

export function getVaccinationGridRow(
  data: I693FormData,
  vaccineCode: string
): I693VaccinationGridRow {
  const grid = data.vaccination_grid?.length
    ? data.vaccination_grid
    : defaultVaccinationGrid()
  let row = grid.find((r) => r.vaccineCode === vaccineCode)
  if (!row) {
    row = { vaccineCode }
    grid.push(row)
  }
  return row
}

function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  return formatDateForPdfDisplay(iso.trim().slice(0, 10))
}

function doseDate(row: I693VaccinationGridRow, doseIndex: number): string {
  if (doseIndex <= 1 && row.dateReceived) return formatDate(row.dateReceived)
  const doses = row.datesReceived
  if (doses?.[doseIndex - 1]) return formatDate(doses[doseIndex - 1])
  if (doseIndex === 1 && row.dateReceived) return formatDate(row.dateReceived)
  return ''
}

/** Selector checkboxes for which formulation was administered (Td/Tdap, OPV/IPV). */
function vaccineGivenSelectorValue(
  data: I693FormData,
  short: string,
  widgetIndex: number
): boolean | null {
  if (short === 'P9_TDVaccineCheckBox') return getVaccinationGridRow(data, 'td').givenTdap === true
  if (short === 'P10_TDVaccineCheckBox') return getVaccinationGridRow(data, 'td').givenTd === true
  if (short === 'Pt10_PVVaccineCheckBox') {
    const polio = getVaccinationGridRow(data, 'polio')
    return widgetIndex === 1 ? polio.givenIpv === true : polio.givenOpv === true
  }
  return null
}

/** Value to write into a vaccination-table PDF widget. */
export function vaccinationWidgetValue(
  data: I693FormData,
  short: string,
  widgetIndex = 0
): string | boolean | null {
  const selector = vaccineGivenSelectorValue(data, short, widgetIndex)
  if (selector !== null) return selector

  const parsed = parseVaccinationWidgetAtIndex(short, widgetIndex)
  if (!parsed) return null

  const row = getVaccinationGridRow(data, parsed.vaccineCode)

  switch (parsed.field) {
    case 'dateGiven':
      return formatDate(row.dateGiven)
    case 'dateReceived':
      return doseDate(row, parsed.doseIndex || 1)
    case 'datesReceived':
      return doseDate(row, parsed.doseIndex)
    case 'completeSeries':
      // Form convention: Mark "X" if the series is complete.
      return row.completeSeries ? 'X' : ''
    case 'contraindicated':
      return row.contraindicated === true
    case 'insufficientInterval':
      return row.insufficientInterval === true
    case 'notAgeAppropriate':
      return row.notAgeAppropriate === true
    case 'immune':
      return row.immune === true
    case 'historyOfDisease':
      return row.historyOfDisease === true
    case 'vaccineGiven':
      return row.dateGiven != null && row.dateGiven !== ''
    default:
      return null
  }
}

/** Update grid row from PDF widget value (extract). */
export function applyVaccinationWidgetToGrid(
  data: I693FormData,
  short: string,
  raw: string,
  checked: boolean,
  widgetIndex = 0
): void {
  if (!data.vaccination_grid?.length) {
    data.vaccination_grid = defaultVaccinationGrid()
  }

  if (short === 'P9_TDVaccineCheckBox') {
    getVaccinationGridRow(data, 'td').givenTdap = checked
    return
  }
  if (short === 'P10_TDVaccineCheckBox') {
    getVaccinationGridRow(data, 'td').givenTd = checked
    return
  }
  if (short === 'Pt10_PVVaccineCheckBox') {
    const polio = getVaccinationGridRow(data, 'polio')
    if (widgetIndex === 1) polio.givenIpv = checked
    else polio.givenOpv = checked
    return
  }

  const parsed = parseVaccinationWidgetAtIndex(short, widgetIndex)
  if (!parsed) return

  const row = getVaccinationGridRow(data, parsed.vaccineCode)
  const val = raw.trim()

  switch (parsed.field) {
    case 'dateGiven':
      row.dateGiven = val
      break
    case 'dateReceived':
      row.dateReceived = val
      break
    case 'datesReceived': {
      if (!row.datesReceived) row.datesReceived = []
      const idx = Math.max(0, parsed.doseIndex - 1)
      while (row.datesReceived.length <= idx) row.datesReceived.push('')
      row.datesReceived[idx] = val
      if (parsed.doseIndex === 1) row.dateReceived = val
      break
    }
    case 'completeSeries':
      row.completeSeries =
        checked || val === 'Yes' || val === 'On' || val.toUpperCase() === 'X'
      break
    case 'contraindicated':
      row.contraindicated = checked
      break
    case 'insufficientInterval':
      row.insufficientInterval = checked
      break
    case 'notAgeAppropriate':
      row.notAgeAppropriate = checked
      break
    case 'immune':
      row.immune = checked
      break
    case 'historyOfDisease':
      row.historyOfDisease = checked
      break
    case 'vaccineGiven':
      break
    default:
      break
  }
}

export type VaccinationPdfBinding = {
  key: 'vaccination_grid'
  pdfFieldName: string
  page: number
  kind: 'text' | 'mark'
  vaccineCode: string
  field: VaccinationWidgetField
  when?: string
}
