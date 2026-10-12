import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { bridgeGet } from '@/lib/bridge/sync'
import type { SignupRequestRow } from '@/lib/signup-requests/types'

export const dynamic = 'force-dynamic'

/** Clinic signups live behind mcm-bridge; this route keeps admin auth. */
export async function GET(req: NextRequest) {
  try {
    await requireAdminUser()
    const status = req.nextUrl.searchParams.get('status')
    const suffix =
      status === 'pending' || status === 'approved' || status === 'rejected' ? `?status=${status}` : ''
    const result = await bridgeGet<{ data: SignupRequestRow[] }>(`/clinic-signups${suffix}`)
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
