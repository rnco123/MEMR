import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { canViewClinicalEncounterContent } from '@/lib/roles'
import { normalizeDiagnosisSearch } from '@/lib/diagnoses/validation'
import {
  diagnosisCandidateTerms,
  icdCodeSearchVariants,
  selectNearestDiagnosis,
  type AiDiagnosisSuggestion,
  type DiagnosisCatalogRow,
} from '@/lib/diagnoses/matching'

export const dynamic = 'force-dynamic'

const MAX_RESULTS = 20
const MAX_MATCH_CANDIDATES = 40

const matchSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(30),
        description: z.string().trim().min(1).max(300),
      })
    )
    .max(10),
})

async function requireClinicalViewer() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new AuthenticationError()

  const roleInfo = await fetchUserRole(supabase, user.id)
  if (!canViewClinicalEncounterContent(roleInfo?.role)) {
    throw new AuthorizationError('Clinical staff only')
  }
}

export async function GET(request: Request) {
  try {
    await requireClinicalViewer()

    // PostgREST `.or()` uses commas and parentheses as syntax, so normalize
    // input before interpolating it into the filter expression.
    const query = normalizeDiagnosisSearch(
      new URL(request.url).searchParams.get('q') ?? ''
    )
    if (!query) return NextResponse.json({ diagnoses: [] })

    const admin = createAdminClient()
    const pattern = `%${query}%`
    const { data, error } = await admin
      .from('all_diagnoses')
      .select('id, icd_code, description')
      .or(`icd_code.ilike.${pattern},description.ilike.${pattern}`)
      .order('icd_code', { ascending: true })
      .limit(MAX_RESULTS)

    if (error) throw error
    return NextResponse.json({ diagnoses: data ?? [] })
  } catch (error) {
    return handleApiError(error)
  }
}

async function matchSuggestion(
  suggestion: AiDiagnosisSuggestion
): Promise<ReturnType<typeof selectNearestDiagnosis>> {
  const admin = createAdminClient()
  const exactCodeVariants = icdCodeSearchVariants(suggestion.code)
  if (exactCodeVariants.length > 0) {
    const { data: exact, error: exactError } = await admin
      .from('all_diagnoses')
      .select('id, icd_code, description')
      .or(exactCodeVariants.map((code) => `icd_code.ilike.${code}`).join(','))
      .limit(1)
    if (exactError) throw exactError
    if (exact?.[0]) {
      return selectNearestDiagnosis(suggestion, exact as DiagnosisCatalogRow[])
    }
  }

  const terms = diagnosisCandidateTerms(suggestion)
  if (terms.length === 0) return null
  const filters = terms.flatMap((term) => [
    `icd_code.ilike.${term}%`,
    `description.ilike.%${term}%`,
  ])
  const { data, error } = await admin
    .from('all_diagnoses')
    .select('id, icd_code, description')
    .or(filters.join(','))
    .limit(MAX_MATCH_CANDIDATES)
  if (error) throw error

  return selectNearestDiagnosis(suggestion, (data ?? []) as DiagnosisCatalogRow[])
}

export async function POST(request: Request) {
  try {
    await requireClinicalViewer()
    const parsed = matchSuggestionsSchema.parse(await request.json())
    const matched = await Promise.all(parsed.suggestions.map(matchSuggestion))
    const seen = new Set<number>()
    const matches = matched.filter((row) => {
      if (!row || seen.has(row.id)) return false
      seen.add(row.id)
      return true
    })
    return NextResponse.json({ matches })
  } catch (error) {
    return handleApiError(error)
  }
}
