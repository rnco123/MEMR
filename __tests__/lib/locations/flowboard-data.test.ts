import { isActiveFlowboardRow } from '@/lib/locations/flowboard-data'

const TODAY = '2026-06-25'

describe('isActiveFlowboardRow', () => {
  test('shows today completed', () => {
    expect(isActiveFlowboardRow(TODAY, 'completed', TODAY)).toBe(true)
  })

  test('shows past in_consultation', () => {
    expect(isActiveFlowboardRow('2026-06-23', 'in_consultation', TODAY)).toBe(true)
  })

  test('hides past completed', () => {
    expect(isActiveFlowboardRow('2026-06-23', 'completed', TODAY)).toBe(false)
  })

  test('shows future completed', () => {
    expect(isActiveFlowboardRow('2026-06-26', 'completed', TODAY)).toBe(true)
  })

  test('shows past with no encounter status', () => {
    expect(isActiveFlowboardRow('2026-06-23', null, TODAY)).toBe(true)
  })
})
