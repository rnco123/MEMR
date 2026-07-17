import {
  applyVaccinationWidgetToGrid,
  vaccinationWidgetValue,
} from '@/lib/i693/vaccination-grid-map'
import {
  extractI693FormFromPdfDocumentPreserving,
  extractI693FormFromPdfDocumentRespectingUserEdits,
} from '@/lib/i693/pdfjs-form-bridge'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { wantPdfCheckboxChecked } from '@/lib/i693/pdf-checkbox-utils'
import { mergeI693Form } from '@/lib/i693/types'

describe('vaccination grid extract from PDF widget values', () => {
  it('stores waiver ticks when pdf.js reports export value 1', () => {
    const form = mergeI693Form({})
    const checked = wantPdfCheckboxChecked('1', '1')
    expect(checked).toBe(true)

    applyVaccinationWidgetToGrid(form, 'Pt10Line1_NotAge1', '1', checked, 0)
    applyVaccinationWidgetToGrid(form, 'Pt10Line6_InsufficientCheckBox6', '1', checked, 0)
    applyVaccinationWidgetToGrid(form, 'P10_TDVaccineCheckBox', 'Td', checked, 0)
    applyVaccinationWidgetToGrid(form, 'Pt10_PVVaccineCheckBox', 'IPV', checked, 1)

    const dt = form.vaccination_grid.find((r) => r.vaccineCode === 'dt')
    const hepB = form.vaccination_grid.find((r) => r.vaccineCode === 'hep_b')
    const td = form.vaccination_grid.find((r) => r.vaccineCode === 'td')
    const polio = form.vaccination_grid.find((r) => r.vaccineCode === 'polio')

    expect(dt?.notAgeAppropriate).toBe(true)
    expect(hepB?.insufficientInterval).toBe(true)
    expect(td?.givenTd).toBe(true)
    expect(polio?.givenIpv).toBe(true)
  })

  it('stores complete series from X mark', () => {
    const form = mergeI693Form({})
    applyVaccinationWidgetToGrid(form, 'Pt10Line4_CompleteSeries', 'X', false, 0)
    const mmr = form.vaccination_grid.find((r) => r.vaccineCode === 'mmr')
    expect(mmr?.completeSeries).toBe(true)
  })

  it('maps repeated complete-series widgets to their physical vaccine rows', () => {
    const form = mergeI693Form({
      vaccination_grid: [
        { vaccineCode: 'polio', completeSeries: true },
        { vaccineCode: 'mmr', completeSeries: false },
        { vaccineCode: 'hib', completeSeries: true },
        { vaccineCode: 'varicella', completeSeries: false },
        { vaccineCode: 'pneumo', completeSeries: true },
        { vaccineCode: 'influenza', completeSeries: false },
        { vaccineCode: 'meningococcal', completeSeries: true },
        { vaccineCode: 'rotavirus', completeSeries: false },
      ],
    })

    expect(
      Array.from({ length: 8 }, (_, index) =>
        vaccinationWidgetValue(form, 'Pt10Line1_CompleteSeries', index)
      )
    ).toEqual(['X', '', 'X', '', 'X', '', 'X', ''])
  })

  it('maps the template row-10 complete-series widget to hepatitis A', () => {
    const form = mergeI693Form({
      vaccination_grid: [{ vaccineCode: 'hep_a', completeSeries: true }],
    })

    expect(vaccinationWidgetValue(form, 'Pt7Line1_CompleteSeries')).toBe('X')
  })

  it('clears user-edited vaccine values instead of retaining previous defaults', () => {
    const form = mergeI693Form({
      vaccination_grid: [
        {
          vaccineCode: 'mmr',
          datesReceived: ['01/01/2020'],
          completeSeries: true,
          notAgeAppropriate: true,
        },
      ],
    })

    applyVaccinationWidgetToGrid(form, 'Pt10Line1_CompleteSeries', '', false, 1)
    applyVaccinationWidgetToGrid(form, 'Pt10Line4a_DateReceived_1', '', false)
    applyVaccinationWidgetToGrid(form, 'Pt10Line4_NotAge4', 'Off', false)

    const mmr = form.vaccination_grid.find((row) => row.vaccineCode === 'mmr')
    expect(mmr?.completeSeries).toBe(false)
    expect(mmr?.datesReceived?.[0]).toBe('')
    expect(mmr?.notAgeAppropriate).toBe(false)
  })

  it('honors a cleared complete-series widget during manual edit extraction', async () => {
    const base = mergeI693Form({
      vaccination_grid: [{ vaccineCode: 'mmr', completeSeries: true }],
    })
    const pdf = {
      getFieldObjects: async () => ({
        'form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[1]': [
          { id: 'mmr-complete', value: 'X' },
        ],
      }),
      annotationStorage: {
        getRawValue: () => ({ value: '' }),
      },
    } as unknown as PDFDocumentProxy

    const edited = await extractI693FormFromPdfDocumentRespectingUserEdits(pdf, base)
    const preserving = await extractI693FormFromPdfDocumentPreserving(pdf, base)

    expect(edited.vaccination_grid.find((row) => row.vaccineCode === 'mmr')?.completeSeries).toBe(
      false
    )
    expect(
      preserving.vaccination_grid.find((row) => row.vaccineCode === 'mmr')?.completeSeries
    ).toBe(true)
  })
})
