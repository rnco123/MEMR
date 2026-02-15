/**
 * API Authentication and Authorization Middleware
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError, AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'

/**
 * Require authentication for API route
 */
export async function requireAuth(request: NextRequest): Promise<{
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

  // Get user role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('uid', user.id)
    .single()

  const role = profile?.role || (user as any).user_metadata?.role

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
  return requireRole(request, ['doctor'])
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
  return requireRole(request, ['doctor', 'nurse', 'staff'])
}
