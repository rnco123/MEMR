import { applyVaccinationWidgetToGrid } from '@/lib/i693/vaccination-grid-map'
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
})
