import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { isPhysicianRole } from '@/lib/roles'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { assertEncounterAccess } from '@/lib/encounters/assert-access'
import { batchCompleteEncounters } from '@/lib/encounter/batch-complete'

export const dynamic = 'force-dynamic'

const batchCompleteSchema = z.object({
  encounter_ids: z.array(z.number().int().positive()).min(1).max(50),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isPhysicianRole(roleInfo?.role)) {
      throw new AuthorizationError('Only physicians can complete encounters')
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = batchCompleteSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = createAdminClient()
    const encounterIds = parsed.data.encounter_ids

    for (const encounterId of encounterIds) {
      await assertEncounterAccess(admin, user.id, encounterId)
    }

    const result = await batchCompleteEncounters(admin, {
      encounterIds,
      userId: user.id,
    })

    return NextResponse.json({
      success: result.failed === 0,
      completed: result.completed,
      failed: result.failed,
      results: result.results,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
