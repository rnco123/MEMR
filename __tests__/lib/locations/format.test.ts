import { normalizePhone, resolveGoogleMapUrl } from '@/lib/locations/format'

describe('resolveGoogleMapUrl', () => {
  test('accepts Google Maps place URLs', () => {
    const result = resolveGoogleMapUrl('https://www.google.com/maps/place/Test+Clinic')
    expect(result.valid).toBe(true)
    expect(result.derivedFrom).toBe('link')
    expect(result.url).toContain('google.com/maps')
  })

  test('builds URL from coordinates', () => {
    const result = resolveGoogleMapUrl('29.7604, -95.3698')
    expect(result).toEqual({
      url: 'https://www.google.com/maps?q=29.7604,-95.3698',
      valid: true,
      derivedFrom: 'coordinates',
    })
  })

  test('builds URL from address when map input is empty', () => {
    const result = resolveGoogleMapUrl('', '123 Main St, Houston, TX')
    expect(result.valid).toBe(true)
    expect(result.derivedFrom).toBe('address')
    expect(result.url).toContain('google.com/maps/search')
    expect(result.url).toContain(encodeURIComponent('123 Main St, Houston, TX'))
  })

  test('rejects non-Google URLs', () => {
    const result = resolveGoogleMapUrl('https://example.com/not-a-map')
    expect(result.valid).toBe(false)
    expect(result.url).toBeNull()
  })
})

describe('normalizePhone', () => {
  test('trims and keeps dialable characters', () => {
    expect(normalizePhone('  (817) 555-0100  ')).toBe('(817) 555-0100')
  })

  test('returns null for empty input', () => {
    expect(normalizePhone('   ')).toBeNull()
  })
})
