import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { listImmigrationCases } from '@/lib/immigration/case-sync'
import { isI693ApiRole } from '@/lib/immigration/api-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()

    const admin = createAdminClient()
    const data = await listImmigrationCases(admin)

    return NextResponse.json({ data, count: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}
