export type DiagnosisCatalogRow = {
  id: number
  icd_code: string
  description: string
}

export type AiDiagnosisSuggestion = {
  code: string
  description: string
}

export type MatchedDiagnosisSuggestion = DiagnosisCatalogRow & {
  suggested_code: string
  suggested_description: string
  match_type: 'exact_code' | 'nearest'
}

export function normalizeIcdCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function icdCodeSearchVariants(value: string): string[] {
  const compact = normalizeIcdCode(value)
  if (!compact) return []
  return [
    ...new Set([
      value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, ''),
      compact,
      compact.length > 3 ? `${compact.slice(0, 3)}.${compact.slice(3)}` : compact,
    ]),
  ]
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3)
}

function levenshtein(left: string, right: string): number {
  if (!left.length) return right.length
  if (!right.length) return left.length

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]!
    previous[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j]!
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      )
      diagonal = above
    }
  }
  return previous[right.length]!
}

export function diagnosisMatchScore(
  suggestion: AiDiagnosisSuggestion,
  candidate: DiagnosisCatalogRow
): number {
  const suggestedCode = normalizeIcdCode(suggestion.code)
  const candidateCode = normalizeIcdCode(candidate.icd_code)
  if (suggestedCode && suggestedCode === candidateCode) return 10_000

  const maxCodeLength = Math.max(suggestedCode.length, candidateCode.length, 1)
  const codeSimilarity =
    1 - levenshtein(suggestedCode, candidateCode) / maxCodeLength
  const suggestedWords = new Set(words(suggestion.description))
  const candidateWords = new Set(words(candidate.description))
  const overlap = [...suggestedWords].filter((word) => candidateWords.has(word)).length
  const wordUnion = new Set([...suggestedWords, ...candidateWords]).size
  const descriptionSimilarity = wordUnion > 0 ? overlap / wordUnion : 0

  return codeSimilarity * 100 + descriptionSimilarity * 45
}

export function selectNearestDiagnosis(
  suggestion: AiDiagnosisSuggestion,
  candidates: DiagnosisCatalogRow[]
): MatchedDiagnosisSuggestion | null {
  if (candidates.length === 0) return null

  const ranked = [...candidates].sort((left, right) => {
    const scoreDifference =
      diagnosisMatchScore(suggestion, right) - diagnosisMatchScore(suggestion, left)
    if (scoreDifference !== 0) return scoreDifference
    return left.icd_code.localeCompare(right.icd_code)
  })
  const selected = ranked[0]!
  const exact =
    normalizeIcdCode(suggestion.code) === normalizeIcdCode(selected.icd_code)

  return {
    ...selected,
    suggested_code: suggestion.code,
    suggested_description: suggestion.description,
    match_type: exact ? 'exact_code' : 'nearest',
  }
}

export function diagnosisCandidateTerms(suggestion: AiDiagnosisSuggestion): string[] {
  const code = normalizeIcdCode(suggestion.code)
  const descriptionWords = words(suggestion.description)
    .sort((left, right) => right.length - left.length)
    .slice(0, 3)
  return [...new Set([code.slice(0, 3), ...descriptionWords].filter((term) => term.length >= 2))]
}
