jest.mock('@/lib/api-error-handler', () => ({
  ValidationError: class ValidationError extends Error {},
}))

import {
  assertDiagnosisEncounterEditable,
  includesDiagnosisId,
  normalizeDiagnosisSearch,
  parseDiagnosisId,
} from '@/lib/diagnoses/validation'

describe('diagnosis API validation', () => {
  it('normalizes searchable ICD code and description text', () => {
    expect(normalizeDiagnosisSearch('  E11.9   diabetes  ')).toBe('E11.9 diabetes')
  })

  it('removes PostgREST filter syntax from search text', () => {
    expect(normalizeDiagnosisSearch('diabetes),id.gt.0')).toBe('diabetes id.gt.0')
  })

  it('does not search for fewer than two usable characters', () => {
    expect(normalizeDiagnosisSearch('A')).toBeNull()
    expect(normalizeDiagnosisSearch('(),')).toBeNull()
  })

  it('rejects oversized searches', () => {
    expect(() => normalizeDiagnosisSearch('x'.repeat(101))).toThrow('too long')
  })

  it('accepts positive encounter and diagnosis identifiers', () => {
    expect(parseDiagnosisId('42', 'encounter id')).toBe(42)
    expect(parseDiagnosisId(7, 'diagnosis id')).toBe(7)
  })

  it.each(['0', '-1', 'abc', '1.2', undefined])(
    'rejects invalid identifier %p',
    (value) => {
      expect(() => parseDiagnosisId(value, 'diagnosis id')).toThrow('Invalid diagnosis id')
    }
  )

  it('detects an encounter duplicate regardless of numeric serialization', () => {
    expect(includesDiagnosisId([{ diagnosis_id: '12' }], 12)).toBe(true)
    expect(includesDiagnosisId([{ diagnosis_id: 13 }], 12)).toBe(false)
  })

  it('locks diagnosis mutations after encounter completion', () => {
    expect(() => assertDiagnosisEncounterEditable('completed')).toThrow(
      'Diagnoses cannot be changed'
    )
    expect(() => assertDiagnosisEncounterEditable('in_consultation')).not.toThrow()
  })
})
