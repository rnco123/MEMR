import type { SupabaseClient } from '@supabase/supabase-js'

/** Resolve `doctors.id` for the logged-in auth user. */
export async function getDoctorRowId(
  supabase: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data, error } = await supabase.from('doctors').select('id').eq('user_id', userId).maybeSingle()
  if (error || !data?.id) return null
  return Number(data.id)
}
