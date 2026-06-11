import { createClient } from '@/lib/supabase/server'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'

export async function requireNurseUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new AuthenticationError()

  const profile = await fetchUserRole(supabase, user.id)
  if (profile?.role !== 'nurse') {
    throw new AuthorizationError('Nurses only')
  }

  return { supabase, user, profile }
}
