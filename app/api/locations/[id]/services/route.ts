import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AuthenticationError, handleApiError, ValidationError } from '@/lib/api-error-handler'
import { bridgeGet } from '@/lib/bridge/sync'

export const dynamic = 'force-dynamic'

type ServiceRow = { id: number; title_en: string | null; title_es: string | null }

/**
 * The services a location offers, for any signed-in member of staff.
 *
 * Separate from /api/admin/configurations, which is admin-only: a nurse filling in an
 * encounter needs to know what the clinic offers, but has no business reading or
 * editing the rules themselves.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const locationId = Number(params.id)
    if (!Number.isFinite(locationId) || locationId <= 0) {
      throw new ValidationError('Invalid location id')
    }

    const services = await bridgeGet<ServiceRow[]>(`/catalog/locations/${locationId}/services`)
    return NextResponse.json({ services })
  } catch (err) {
    return handleApiError(err)
  }
}
