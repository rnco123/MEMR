import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '@/lib/api-error-handler'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { guardI693EncounterAccess } from '@/lib/encounters/guard'
import { resolveI693LocationAutofill } from '@/lib/i693/location-autofill'
import { logI693Audit } from '@/lib/i693/audit-log'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()

    const admin = await guardI693EncounterAccess(user.id, encounterId)
    const result = await resolveI693LocationAutofill(admin, encounterId)

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const role = roleInfo?.role?.trim().toLowerCase()
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()

    const admin = await guardI693EncounterAccess(user.id, encounterId)
    const result = await resolveI693LocationAutofill(admin, encounterId)

    if (!result.available) {
      return NextResponse.json(
        { error: result.reason ?? 'Location auto-fill is not available for this encounter' },
        { status: 422 }
      )
    }

    await logI693Audit('location_autofill', encounterId, {
      location_id: result.location_id,
      location_group: result.location_group,
      region_label: result.region_label,
      role,
      source: role === 'admin' ? 'admin' : 'clinical',
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
