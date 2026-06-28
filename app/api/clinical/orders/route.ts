import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { canViewClinicalEncounterContent } from '@/lib/roles'

import { ENCOUNTER_ORDER_SELECT } from '@/lib/encounters/encounter-detail-selects'

export const dynamic = 'force-dynamic'

const MAX_ORDERS = 200

export async function GET(req: NextRequest) {
  try {
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

    const filter = req.nextUrl.searchParams.get('filter') ?? 'pending'
    const admin = createAdminClient()

    let q = admin
      .from('encounter_orders')
      .select(
        `
        ${ENCOUNTER_ORDER_SELECT},
        patients:patient_id ( first_name, last_name )
      `
      )
      .order('created_at', { ascending: false })
      .limit(MAX_ORDERS)

    if (filter === 'pending') {
      q = q.in('status', ['pending', 'in_progress'])
    } else if (filter === 'completed') {
      q = q.eq('status', 'completed')
    }

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}
