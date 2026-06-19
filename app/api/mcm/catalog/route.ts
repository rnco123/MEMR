import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  fetchMcmCategories,
  fetchMcmProducts,
  fetchMcmProductsByIds,
} from '@/lib/mcm/catalog'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '@/lib/api-error-handler'
import { CLINICAL_STAFF_ROLE_SET } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = CLINICAL_STAFF_ROLE_SET

/**
 * Pre-sales product/category catalog from the primary Supabase project.
 *
 * Query params:
 * - `category_id` — filter products (optional)
 * - `product_ids` — comma-separated product IDs (for resolving pre_sales labels)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const role = roleInfo?.role?.toLowerCase()
    if (!role || !ALLOWED_ROLES.has(role)) {
      throw new AuthorizationError('You are not allowed to read the product catalog')
    }

    const url = new URL(request.url)
    const categoryIdParam = url.searchParams.get('category_id')
    const categoryId =
      categoryIdParam && Number.isFinite(Number(categoryIdParam)) ? Number(categoryIdParam) : null

    const productIdsParam = url.searchParams.get('product_ids')
    const admin = createAdminClient()

    if (productIdsParam) {
      const ids = productIdsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
      const products = await fetchMcmProductsByIds(admin, ids)
      return NextResponse.json({
        success: true,
        categories: [],
        products,
        source: 'primary_supabase',
      })
    }

    const categories = await fetchMcmCategories(admin)
    const products = await fetchMcmProducts(admin, categoryId)

    return NextResponse.json({
      success: true,
      categories,
      products,
      source: 'primary_supabase',
    })
  } catch (e) {
    if (e instanceof ValidationError) return handleApiError(e)
    return handleApiError(e)
  }
}
