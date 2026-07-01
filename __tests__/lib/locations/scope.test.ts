import { isAllowedByLocationScope } from '@/lib/locations/scope'

describe('isAllowedByLocationScope', () => {
  test('denies when no locations assigned', () => {
    const scope = { unrestricted: false, locationIds: [] as number[] }
    expect(isAllowedByLocationScope(scope, 1)).toBe(false)
  })

  test('allows patient at an assigned location', () => {
    const scope = { unrestricted: false, locationIds: [2, 5] }
    expect(isAllowedByLocationScope(scope, 2)).toBe(true)
    expect(isAllowedByLocationScope(scope, 9)).toBe(false)
  })

  test('denies null location id', () => {
    const scope = { unrestricted: false, locationIds: [2] }
    expect(isAllowedByLocationScope(scope, null)).toBe(false)
  })
})
