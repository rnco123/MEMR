import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { createClient } from '@/lib/supabase/server'

export const PHARMACY_ADMIN_ROLES = new Set(['admin'])

export type ClinicalUser = {
  id: string
  role: string
}

export async function requirePharmacyAdminUser(): Promise<{
  supabase: SupabaseClient
  user: ClinicalUser
}> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new AuthenticationError()
  }

  const roleInfo = await fetchUserRole(supabase, user.id)
  const role = roleInfo?.role ?? ''
  if (!PHARMACY_ADMIN_ROLES.has(role)) {
    throw new AuthorizationError('Pharmacy management is restricted to admins')
  }

  return { supabase: supabase as unknown as SupabaseClient, user: { id: user.id, role } }
}
