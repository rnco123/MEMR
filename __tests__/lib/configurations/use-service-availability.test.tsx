import { renderHook, waitFor } from '@testing-library/react'
import { useServiceAvailability } from '@/lib/configurations/use-service-availability'

const rows = [
  { location_id: 10, portal_enabled: true, emr_enabled: true, service_ids: [1, 3] },
  { location_id: 11, portal_enabled: false, emr_enabled: true, service_ids: [2] },
]

const services = [{ id: 1 }, { id: 2 }, { id: 3 }]

function mockFetch(payload: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }) as unknown as typeof fetch
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('useServiceAvailability', () => {
  it('loads the rules from the API', async () => {
    mockFetch({ data: rows })
    const { result } = renderHook(() => useServiceAvailability())

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.config['10']).toEqual({
      portal_enabled: true,
      emr_enabled: true,
      service_ids: [1, 3],
    })
  })

  it('filters a service list to what the location offers on that surface', async () => {
    mockFetch({ data: rows })
    const { result } = renderHook(() => useServiceAvailability())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.filterServicesForLocation(services, 10, 'emr').map((s) => s.id)).toEqual([
      1, 3,
    ])
    // location 11 is not portal-enabled, so nothing shows on the portal
    expect(result.current.filterServicesForLocation(services, 11, 'portal')).toEqual([])
    expect(result.current.filterServicesForLocation(services, 11, 'emr').map((s) => s.id)).toEqual([
      2,
    ])
  })

  it('passes the list through for a location with no assignments', async () => {
    mockFetch({ data: rows })
    const { result } = renderHook(() => useServiceAvailability())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.filterServicesForLocation(services, 99, 'emr')).toEqual(services)
    expect(result.current.filterServicesForLocation(services, null, 'emr')).toEqual(services)
    expect(result.current.isLocationConfigured(99)).toBe(false)
    expect(result.current.isLocationConfigured(10)).toBe(true)
  })

  it('does not empty a picker when the load fails', async () => {
    mockFetch({ error: 'boom' }, false)
    const { result } = renderHook(() => useServiceAvailability())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.config).toEqual({})
    expect(result.current.filterServicesForLocation(services, 10, 'emr')).toEqual(services)
  })
})
