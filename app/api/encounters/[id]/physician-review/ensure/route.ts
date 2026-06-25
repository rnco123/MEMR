import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { ensureEncounterPhysicianReview } from '@/lib/compliance/ensure-physician-review'
import { assertEncounterAccess } from '@/lib/encounters/assert-access'
import { fetchUserRole } from '@/lib/fetch-user-role'

export const dynamic = 'force-dynamic'

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

/** Idempotent — creates pending physician review row when FNP/PA documents an encounter. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId)

    const roleInfo = await fetchUserRole(supabase, user.id)
    const result = await ensureEncounterPhysicianReview(admin, {
      encounterId,
      documentingUserId: user.id,
      documentingRole: roleInfo?.role ?? null,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return handleApiError(err)
  }
}
