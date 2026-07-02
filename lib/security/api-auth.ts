/**
 * API Authentication and Authorization Middleware
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError, AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { PHYSICIAN_ROLE_VALUES, CLINICAL_STAFF_ROLE_VALUES } from '@/lib/roles'

/**
 * Require authentication for API route
 */
export async function requireAuth(_request: NextRequest): Promise<{
  user: { id: string; email?: string }
  supabase: Awaited<ReturnType<typeof createClient>>
} | NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return handleApiError(new AuthenticationError())
  }

  return { user, supabase }
}

/**
 * Require specific role for API route
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: string[]
): Promise<{
  user: { id: string; email?: string }
  role: string
  supabase: Awaited<ReturnType<typeof createClient>>
} | NextResponse> {
  const authResult = await requireAuth(request)
  
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { user, supabase } = authResult

  // Get user role (supports both uid and id column schemas).
  // H-03: profiles table is the only authoritative source — user_metadata.role
  // is user-controlled and must never grant access.
  const profile = await fetchUserRole(supabase, user.id)
  const role = profile?.role

  if (!role || !allowedRoles.includes(role)) {
    return handleApiError(
      new AuthorizationError(`Access denied. Required roles: ${allowedRoles.join(', ')}`)
    )
  }

  return { user, role, supabase }
}

/**
 * Require doctor role
 */
export async function requireDoctor(request: NextRequest) {
  return requireRole(request, [...PHYSICIAN_ROLE_VALUES])
}

/**
 * Require nurse or staff role
 */
export async function requireNurse(request: NextRequest) {
  return requireRole(request, ['nurse', 'staff'])
}

/**
 * Require doctor or nurse role
 */
export async function requireMedicalStaff(request: NextRequest) {
  return requireRole(request, [...CLINICAL_STAFF_ROLE_VALUES])
}
