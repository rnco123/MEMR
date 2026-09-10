import {
  DEFAULT_RULES,
  configFromRows,
  countLocationAssignments,
  getLocationRules,
  isServiceAssigned,
  isServiceEnabledOn,
  normalizeServiceAvailability,
  sameConfig,
  sameRules,
  setLocationServices,
  setLocationSurface,
  setServiceAssigned,
  type ServiceAvailabilityConfig,
} from '@/lib/configurations/service-availability'

const config = (): ServiceAvailabilityConfig => ({
  '10': { portal_enabled: true, emr_enabled: true, service_ids: [1, 3] },
  '11': { portal_enabled: false, emr_enabled: true, service_ids: [2] },
})

describe('normalizeServiceAvailability', () => {
  it('drops entries that are not location rules', () => {
    expect(
      normalizeServiceAvailability({
        abc: { portal_enabled: true, emr_enabled: true, service_ids: [1] },
        '10': 'nope',
        '11': { portal_enabled: true, emr_enabled: true, service_ids: [2] },
      })
    ).toEqual({ '11': { portal_enabled: true, emr_enabled: true, service_ids: [2] } })
  })

  it('defaults the surfaces and de-duplicates service ids', () => {
    expect(normalizeServiceAvailability({ '10': { service_ids: [3, 1, 3, 0, -2] } })).toEqual({
      '10': { portal_enabled: false, emr_enabled: true, service_ids: [1, 3] },
    })
  })

  it('returns an empty config for junk', () => {
    expect(normalizeServiceAvailability(null)).toEqual({})
    expect(normalizeServiceAvailability([1, 2])).toEqual({})
  })
})

describe('configFromRows', () => {
  it('keys rows by location and sorts service ids', () => {
    expect(
      configFromRows([
        { location_id: 10, portal_enabled: true, emr_enabled: false, service_ids: [3, 1] },
      ])
    ).toEqual({ '10': { portal_enabled: true, emr_enabled: false, service_ids: [1, 3] } })
  })
})

describe('rules access', () => {
  it('falls back to defaults for an unconfigured location', () => {
    expect(getLocationRules(config(), 99)).toEqual(DEFAULT_RULES)
    expect(countLocationAssignments(config(), 99)).toBe(0)
  })

  it('reports assignment by service id', () => {
    expect(isServiceAssigned(config(), 10, 1)).toBe(true)
    expect(isServiceAssigned(config(), 10, 2)).toBe(false)
  })
})

describe('setServiceAssigned', () => {
  it('adds without duplicating and keeps ids sorted', () => {
    const next = setServiceAssigned(setServiceAssigned(config(), 10, 2, true), 10, 2, true)
    expect(next['10']!.service_ids).toEqual([1, 2, 3])
  })

  it('removes an assignment', () => {
    expect(setServiceAssigned(config(), 10, 1, false)['10']!.service_ids).toEqual([3])
  })

  it('leaves other locations untouched', () => {
    expect(setServiceAssigned(config(), 10, 1, false)['11']).toEqual(config()['11'])
  })

  it('creates rules for a location that had none', () => {
    const next = setServiceAssigned(config(), 42, 5, true)
    expect(next['42']).toEqual({ ...DEFAULT_RULES, service_ids: [5] })
  })
})

describe('setLocationSurface', () => {
  it('toggles one surface without touching the other or the services', () => {
    const next = setLocationSurface(config(), 10, 'portal', false)
    expect(next['10']).toEqual({ portal_enabled: false, emr_enabled: true, service_ids: [1, 3] })
  })
})

describe('setLocationServices', () => {
  it('replaces the assignments, de-duplicated and sorted', () => {
    expect(setLocationServices(config(), 10, [5, 2, 5])['10']!.service_ids).toEqual([2, 5])
  })
})

describe('isServiceEnabledOn', () => {
  it('requires both the assignment and the surface', () => {
    const c = config()
    expect(isServiceEnabledOn(c, 10, 1, 'portal')).toBe(true)
    expect(isServiceEnabledOn(c, 10, 1, 'emr')).toBe(true)
    // location 11 is not portal-enabled, so its assigned service is EMR-only
    expect(isServiceEnabledOn(c, 11, 2, 'emr')).toBe(true)
    expect(isServiceEnabledOn(c, 11, 2, 'portal')).toBe(false)
    // unassigned service is off on every surface
    expect(isServiceEnabledOn(c, 10, 9, 'emr')).toBe(false)
  })
})

describe('comparison', () => {
  it('detects surface and assignment changes', () => {
    expect(sameConfig(config(), config())).toBe(true)
    expect(sameConfig(config(), setLocationSurface(config(), 10, 'portal', false))).toBe(false)
    expect(sameConfig(config(), setServiceAssigned(config(), 10, 7, true))).toBe(false)
    expect(sameRules(config()['10']!, config()['10']!)).toBe(true)
  })
})
