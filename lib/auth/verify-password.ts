import { createClient } from '@supabase/supabase-js'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'

/** Verify credentials without touching the caller's session cookies. */
export async function verifyUserPassword(email: string, password: string): Promise<boolean> {
  const client = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { error } = await client.auth.signInWithPassword({ email, password })
  return !error
}
