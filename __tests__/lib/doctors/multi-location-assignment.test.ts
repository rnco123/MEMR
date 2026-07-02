/**
 * Providers (doctor/fnp/pa) must be assignable at ANY admin-assigned location
 * (user_locations), not just their single home doctors.location_id.
 * Regression for: "Dr. Dallas is available but a nurse at another of his
 * assigned clinics can't assign him."
 */

import { scopeAllowsAnyLocation, type LocationScope } from '@/lib/locations/scope'
import { loadAvailableDoctors } from '@/lib/doctors/load-available-doctors'

describe('scopeAllowsAnyLocation', () => {
  const scope: LocationScope = { unrestricted: false, locationIds: [5] }

  it('matches when any provider location is in scope', () => {
    expect(scopeAllowsAnyLocation(scope, [28, 5, 6])).toBe(true)
  })

  it('does not match when no provider location is in scope', () => {
    expect(scopeAllowsAnyLocation(scope, [28, 6])).toBe(false)
  })

  it('never matches an empty location list for a restricted scope', () => {
    expect(scopeAllowsAnyLocation(scope, [])).toBe(false)
  })

  it('admin (unrestricted) always matches', () => {
    expect(scopeAllowsAnyLocation({ unrestricted: true, locationIds: [] }, [])).toBe(true)
  })
})

/** Minimal query-builder mock routed by table name. */
function mockAdmin(tables: {
  doctors: Array<Record<string, unknown>>
  user_locations: Array<{ user_uid: string; location_id: number }>
  doctor_availability: Array<{ doctor_id: number; is_available: boolean }>
}) {
  return {
    from(table: keyof typeof tables) {
      const rows = tables[table]
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => Promise.resolve({ data: rows, error: null }),
        in: () => Promise.resolve({ data: rows, error: null }),
      }
      return builder
    },
  } as never
}

describe('loadAvailableDoctors — multi-location matching', () => {
  // Dr. Dallas: home location 28, but admin-assigned to clinics 5 and 28.
  const tables = {
    doctors: [
      { id: 5, user_id: 'dallas', full_name: 'Dallas', email: null, specialty: null },
    ],
    user_locations: [
      { user_uid: 'dallas', location_id: 28 },
      { user_uid: 'dallas', location_id: 5 },
    ],
    doctor_availability: [{ doctor_id: 5, is_available: true }],
  }

  it('shows the provider to a nurse at a NON-home assigned clinic (loc 5)', async () => {
    const result = await loadAvailableDoctors(mockAdmin(tables), {
      unrestricted: false,
      locationIds: [5],
    })
    expect(result.map((d) => d.id)).toContain(5)
  })

  it('shows the provider to a nurse at the home clinic (loc 28)', async () => {
    const result = await loadAvailableDoctors(mockAdmin(tables), {
      unrestricted: false,
      locationIds: [28],
    })
    expect(result.map((d) => d.id)).toContain(5)
  })

  it('hides the provider from a nurse at an unassigned clinic (loc 9)', async () => {
    const result = await loadAvailableDoctors(mockAdmin(tables), {
      unrestricted: false,
      locationIds: [9],
    })
    expect(result).toHaveLength(0)
  })
})
