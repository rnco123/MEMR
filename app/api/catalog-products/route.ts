import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  AuthenticationError,
  AuthorizationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { canViewClinicalEncounterContent } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const CATALOG_SELECT = 'id, category, product, price'

export async function GET() {
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

    const [labsResult, medicationsResult] = await Promise.all([
      supabase
        .from('labs_products')
        .select(CATALOG_SELECT)
        .order('category', { ascending: true })
        .order('product', { ascending: true }),
      supabase
        .from('medication_products')
        .select(CATALOG_SELECT)
        .order('category', { ascending: true })
        .order('product', { ascending: true }),
    ])

    if (labsResult.error) throw labsResult.error
    if (medicationsResult.error) throw medicationsResult.error

    return NextResponse.json({
      labs: labsResult.data ?? [],
      medications: medicationsResult.data ?? [],
    })
  } catch (error) {
    return handleApiError(error)
  }
}
