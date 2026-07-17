import {
  diagnosisCandidateTerms,
  diagnosisMatchScore,
  icdCodeSearchVariants,
  normalizeIcdCode,
  selectNearestDiagnosis,
} from '@/lib/diagnoses/matching'

const catalog = [
  { id: 1, icd_code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  { id: 2, icd_code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycemia' },
  { id: 3, icd_code: 'I10', description: 'Essential (primary) hypertension' },
]

describe('diagnosis catalog matching', () => {
  it('normalizes punctuation and casing before comparing ICD codes', () => {
    expect(normalizeIcdCode(' e11.9 ')).toBe('E119')
    expect(icdCodeSearchVariants('e119')).toEqual(['E119', 'E11.9'])
  })

  it('always prefers an exact ICD code match', () => {
    const match = selectNearestDiagnosis(
      { code: 'e11.9', description: 'diabetes' },
      catalog
    )

    expect(match).toMatchObject({
      id: 1,
      match_type: 'exact_code',
      suggested_code: 'e11.9',
    })
  })

  it('uses both nearby code and description when no exact code exists', () => {
    const suggestion = {
      code: 'E11.6',
      description: 'Type 2 diabetes with high blood sugar',
    }

    expect(diagnosisMatchScore(suggestion, catalog[1]!)).toBeGreaterThan(
      diagnosisMatchScore(suggestion, catalog[2]!)
    )
    expect(selectNearestDiagnosis(suggestion, catalog)?.id).toBe(2)
  })

  it('builds a small set of safe server-side candidate terms', () => {
    expect(
      diagnosisCandidateTerms({
        code: 'R07.9',
        description: 'Unspecified chest pain, acute',
      })
    ).toEqual(['R07', 'unspecified', 'chest', 'acute'])
  })

  it('returns null when the bounded candidate query finds nothing', () => {
    expect(selectNearestDiagnosis({ code: 'Z99', description: 'unknown' }, [])).toBeNull()
  })
})
