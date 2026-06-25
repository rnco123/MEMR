import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { resolveClinicalApiRole } from '@/lib/locations/scope'
import { resolvePatientSearch } from '@/lib/nurse/patient-search-openai'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new AuthenticationError()

    const profile = await fetchUserRole(supabase, user.id)
    if (!resolveClinicalApiRole(profile?.role)) {
      throw new AuthorizationError()
    }

    let body: { query?: string; includeProvider?: boolean }
    try {
      body = await req.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const query = (body.query ?? '').trim()
    if (!query) {
      return NextResponse.json({ data: null })
    }

    const parsed = await resolvePatientSearch(query, {
      includeProvider: Boolean(body.includeProvider),
    })

    return NextResponse.json({ data: parsed })
  } catch (err) {
    return handleApiError(err)
  }
}
