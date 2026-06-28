import type { SupabaseClient } from '@supabase/supabase-js'

export type SupportActorProfile = {
  full_name: string | null
  email: string | null
  role: string | null
}

/** Resolve the acting user's profile for support ticket routes (profiles.uid or profiles.id). */
export async function resolveSupportActor(
  supabase: SupabaseClient,
  userId: string
): Promise<SupportActorProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email, role')
    .or(`uid.eq.${userId},id.eq.${userId}`)
    .maybeSingle()
  return data ?? null
}
