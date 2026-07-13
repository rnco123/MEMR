import {
  extractPharmacyZip,
  normalizeZip,
  sortPharmaciesByDistance,
  zipDistanceMiles,
} from '@/lib/pharmacies/distance'
import type { PharmacyRecord } from '@/lib/pharmacies/normalize'

describe('normalizeZip', () => {
  it('extracts a 5-digit ZIP and drops the +4 suffix', () => {
    expect(normalizeZip('75218')).toBe('75218')
    expect(normalizeZip('75218-1234')).toBe('75218')
    expect(normalizeZip(' 77036 ')).toBe('77036')
    expect(normalizeZip(77036)).toBe('77036')
  })

  it('returns null for junk', () => {
    expect(normalizeZip('')).toBeNull()
    expect(normalizeZip(null)).toBeNull()
    expect(normalizeZip('TX')).toBeNull()
  })
})

describe('extractPharmacyZip', () => {
  it('prefers the explicit zip_code column', () => {
    expect(extractPharmacyZip({ zip_code: '75218', address: '5712 Fondren Rd 77036' })).toBe('75218')
  })

  it('falls back to a ZIP embedded in the address', () => {
    expect(extractPharmacyZip({ zip_code: null, address: '5712 Fondren Rd, Houston, TX 77036' })).toBe('77036')
  })

  it('returns null when no ZIP is present', () => {
    expect(extractPharmacyZip({ zip_code: '', address: 'Main St' })).toBeNull()
  })
})

describe('zipDistanceMiles', () => {
  it('returns 0 miles for the same ZIP', () => {
    expect(zipDistanceMiles('75218', '75218')).toBe(0)
  })

  it('returns a positive distance between two real ZIPs', () => {
    const d = zipDistanceMiles('75218', '77036') // Dallas -> Houston
    expect(typeof d).toBe('number')
    expect(d).toBeGreaterThan(100)
  })

  it('returns null when either ZIP is unknown', () => {
    expect(zipDistanceMiles('00000', '77036')).toBeNull()
    expect(zipDistanceMiles(null, '77036')).toBeNull()
  })
})

describe('sortPharmaciesByDistance', () => {
  const rec = (id: number, name: string, distanceMiles: number | null): PharmacyRecord => ({
    id,
    name,
    address: null,
    phone: null,
    email: null,
    distanceMiles,
  })

  it('orders known distances ascending, unknowns last (alphabetical)', () => {
    const sorted = sortPharmaciesByDistance([
      rec(1, 'Walmart Far', 40),
      rec(2, 'Walmart Zeta', null),
      rec(3, 'Walmart Near', 2),
      rec(4, 'Walmart Alpha', null),
    ])
    expect(sorted.map((p) => p.id)).toEqual([3, 1, 4, 2])
  })

  it('breaks distance ties by name', () => {
    const sorted = sortPharmaciesByDistance([
      rec(1, 'B Pharmacy', 5),
      rec(2, 'A Pharmacy', 5),
    ])
    expect(sorted.map((p) => p.id)).toEqual([2, 1])
  })

  it('does not mutate the input array', () => {
    const input = [rec(1, 'X', 10), rec(2, 'Y', 1)]
    const copy = [...input]
    sortPharmaciesByDistance(input)
    expect(input).toEqual(copy)
  })
})
