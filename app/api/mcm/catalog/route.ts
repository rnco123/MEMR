import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createExternalAdminClient } from '@/lib/supabase/external-admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  fetchExternalCategories,
  fetchExternalProducts,
  fetchExternalProductsByIds,
} from '@/lib/mcm/external-catalog'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['doctor', 'nurse', 'staff'])

/**
 * MCM product/category catalog — always read from the secondary Supabase project
 * (`EXTERNAL_SUPABASE_URL` + service role via `createExternalAdminClient`).
 *
 * Query params:
 * - `category_id` — filter products (optional)
 * - `product_ids` — comma-separated MCM product IDs (for resolving EMR pre_sales labels)
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
      throw new AuthorizationError('You are not allowed to read MCM catalog')
    }

    const url = new URL(request.url)
    const categoryIdParam = url.searchParams.get('category_id')
    const categoryId =
      categoryIdParam && Number.isFinite(Number(categoryIdParam)) ? Number(categoryIdParam) : null

    const productIdsParam = url.searchParams.get('product_ids')
    let external
    try {
      external = createExternalAdminClient()
    } catch {
      return NextResponse.json(
        {
          error:
            'MCM catalog is not configured. Set EXTERNAL_SUPABASE_URL and EXTERNAL_SUPABASE_SECRET_KEY (or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY).',
        },
        { status: 503 }
      )
    }

    if (productIdsParam) {
      const ids = productIdsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
      const products = await fetchExternalProductsByIds(external, ids)
      return NextResponse.json({
        success: true,
        categories: [],
        products,
        source: 'external_supabase',
      })
    }

    const categories = await fetchExternalCategories(external)
    const products = await fetchExternalProducts(external, categoryId)

    return NextResponse.json({
      success: true,
      categories,
      products,
      source: 'external_supabase',
    })
  } catch (e) {
    if (e instanceof ValidationError) return handleApiError(e)
    return handleApiError(e)
  }
}
