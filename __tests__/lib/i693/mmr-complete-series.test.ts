/**
 * The generic Pt10Line1_CompleteSeries widget has one instance per row. It was
 * matched to dt for every instance, so per-row completes (e.g. MMR "Complete
 * Series" → X) never rendered. Index now selects the row.
 */

import { vaccinationWidgetValue } from '@/lib/i693/vaccination-grid-map'
import { EMPTY_I693_FORM, mergeI693Form } from '@/lib/i693/types'

function withGrid(rows: Array<Record<string, unknown>>) {
  return mergeI693Form({ ...EMPTY_I693_FORM, vaccination_grid: rows as never })
}

describe('MMR complete-series widget', () => {
  it('renders X on the MMR row (index 1), not on other rows', () => {
    const data = withGrid([{ vaccineCode: 'mmr', completeSeries: true }])
    // index 1 → line 4 → mmr
    expect(vaccinationWidgetValue(data, 'Pt10Line1_CompleteSeries', 1)).toBe('X')
    // index 0 → line 3 → polio (no completeSeries) → blank
    expect(vaccinationWidgetValue(data, 'Pt10Line1_CompleteSeries', 0)).toBe('')
    // index 2 → line 5 → hib → blank
    expect(vaccinationWidgetValue(data, 'Pt10Line1_CompleteSeries', 2)).toBe('')
  })

  it('does not stamp every complete cell when only one row is complete', () => {
    const data = withGrid([{ vaccineCode: 'mmr', completeSeries: true }])
    const marks = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
      vaccinationWidgetValue(data, 'Pt10Line1_CompleteSeries', i)
    )
    expect(marks.filter((v) => v === 'X')).toHaveLength(1)
  })
})
