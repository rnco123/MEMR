/**
 * M-05 Security tests: PostgREST filter injection in search
 */

import { sanitizePatientSearchTerm } from '@/lib/nurse/patient-search-query'

describe('M-05 — Search term sanitization', () => {
  // M-05-T01: Comma injection removed
  it('M-05-T01 removes commas from search term', () => {
    const result = sanitizePatientSearchTerm('foo,location_id.eq.999')
    expect(result).not.toContain(',')
    expect(result).toContain('foo')
  })

  // M-05-T02: Parentheses removed
  it('M-05-T02 removes parentheses from search term', () => {
    const result = sanitizePatientSearchTerm('foo(bar)')
    expect(result).not.toContain('(')
    expect(result).not.toContain(')')
  })

  // M-05-T03: Safe search passes through
  it('M-05-T03 normal search term is unchanged', () => {
    const result = sanitizePatientSearchTerm('Smith')
    expect(result).toBe('Smith')
  })

  it('trims and collapses whitespace', () => {
    const result = sanitizePatientSearchTerm('  John   Doe  ')
    expect(result).toBe('John Doe')
  })

  it('empty string returns empty string', () => {
    expect(sanitizePatientSearchTerm('')).toBe('')
  })
})
