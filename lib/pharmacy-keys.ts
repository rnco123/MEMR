import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import { UserRole } from '@/lib/roles'

export const PHARMACY_ADMIN_ROLES = new Set([UserRole.ADMIN])

export type ClinicalUser = {
  id: string
  role: string
}

export async function requirePharmacyAdminUser(): Promise<{
  supabase: SupabaseClient
  user: ClinicalUser
}> {
  const user = await requireAdminUser()
  const supabase = await createClient()
  return {
    supabase: supabase as unknown as SupabaseClient,
    user: { id: user.id, role: UserRole.ADMIN },
  }
}
