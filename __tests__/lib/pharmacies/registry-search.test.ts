/**
 * Nurse pharmacy registry: server-side search so pharmacies beyond the initial
 * 500-row default list (e.g. "Walmart" at alphabetical position ~4900 of 5497)
 * are findable. Regression for: admin sees Walmart but nurse modal doesn't.
 */

import { loadActivePharmacyRegistry } from '@/lib/pharmacies/load-active-registry'

type Call = { method: string; arg: unknown }

/** Chainable query-builder mock that records calls and resolves to `rows`. */
function mockAdmin(rows: Array<Record<string, unknown>>) {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'or', 'order']) {
    builder[method] = (arg: unknown) => {
      calls.push({ method, arg })
      return builder
    }
  }
  builder.limit = (arg: unknown) => {
    calls.push({ method: 'limit', arg })
    return Promise.resolve({ data: rows, error: null })
  }
  const admin = { from: () => builder } as never
  return { admin, calls }
}

describe('loadActivePharmacyRegistry', () => {
  it('applies only the active filter and a 500 cap when not searching', async () => {
    const { admin, calls } = mockAdmin([])
    await loadActivePharmacyRegistry(admin)

    const orCalls = calls.filter((c) => c.method === 'or')
    expect(orCalls).toHaveLength(1) // just the is_active filter
    expect(orCalls[0]?.arg).toBe('is_active.is.null,is_active.eq.true')
    expect(calls.find((c) => c.method === 'limit')?.arg).toBe(500)
  })

  it('adds a name/address/phone/email search filter and a 50 cap when searching', async () => {
    const { admin, calls } = mockAdmin([])
    await loadActivePharmacyRegistry(admin, { search: 'walmart' })

    const orCalls = calls.filter((c) => c.method === 'or')
    expect(orCalls).toHaveLength(2) // is_active AND search
    expect(String(orCalls[1]?.arg)).toContain('name.ilike.%walmart%')
    expect(String(orCalls[1]?.arg)).toContain('email.ilike.%walmart%')
    expect(calls.find((c) => c.method === 'limit')?.arg).toBe(50)
  })

  it('includes an id.eq clause for numeric search terms', async () => {
    const { admin, calls } = mockAdmin([])
    await loadActivePharmacyRegistry(admin, { search: '123' })

    const searchOr = calls.filter((c) => c.method === 'or')[1]
    expect(String(searchOr?.arg)).toContain('id.eq.123')
  })

  it('ignores blank/whitespace search (treated as no search)', async () => {
    const { admin, calls } = mockAdmin([])
    await loadActivePharmacyRegistry(admin, { search: '   ' })

    expect(calls.filter((c) => c.method === 'or')).toHaveLength(1)
    expect(calls.find((c) => c.method === 'limit')?.arg).toBe(500)
  })
})
