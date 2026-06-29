import { buildClinicaI693VaccinationGrid } from '@/lib/i693/location-autofill'
import type { I693VaccinationGridRow } from '@/lib/i693/types'

function row(grid: I693VaccinationGridRow[], code: string) {
  const found = grid.find((g) => g.vaccineCode === code)
  if (!found) throw new Error(`missing row: ${code}`)
  return found
}

/** Target page-12 grid shared by Dallas, Houston/Kempwood, and San Antonio auto-fill. */
describe('buildClinicaI693VaccinationGrid', () => {
  it('matches the Clinica blanket-waiver target for every region', () => {
    const grid = buildClinicaI693VaccinationGrid()

    expect(row(grid, 'dt').notAgeAppropriate).toBe(true)
    expect(row(grid, 'td').givenTdap).toBe(true)
    expect(row(grid, 'polio').givenIpv).toBe(true)
    expect(row(grid, 'polio').insufficientInterval).toBe(true)
    expect(row(grid, 'mmr').completeSeries).toBe(true)
    expect(row(grid, 'hib').notAgeAppropriate).toBe(true)
    expect(row(grid, 'hep_b').insufficientInterval).toBe(true)
    expect(row(grid, 'varicella').insufficientInterval).toBe(true)
    expect(row(grid, 'pneumo').notAgeAppropriate).toBe(true)
    expect(row(grid, 'influenza').insufficientInterval).toBe(true)

    for (const code of ['hep_a', 'meningococcal', 'rotavirus', 'hpv'] as const) {
      expect(row(grid, code).notAgeAppropriate).toBe(true)
    }
  })
})
