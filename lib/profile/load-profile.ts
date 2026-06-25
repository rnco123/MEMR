import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchProfileFields } from '@/lib/fetch-user-role'

const CORE_FIELDS = 'uid, role, full_name, email, active, compliance_access'
const FIELDS_WITH_AVATAR = `${CORE_FIELDS}, avatar_id`

export type LoadedProfile = {
  uid?: string
  role?: string | null
  full_name?: string | null
  email?: string | null
  active?: boolean
  compliance_access?: boolean
  avatar_id?: string | null
  avatar_column_available: boolean
}

/** Load profile; omits avatar_id if column not migrated yet. */
export async function loadProfileForUser(
  supabase: SupabaseClient,
  userId: string,
  options?: { email?: string | null }
): Promise<LoadedProfile | null> {
  const withAvatar = await fetchProfileFields(supabase, userId, FIELDS_WITH_AVATAR, options)
  if (withAvatar) {
    return {
      uid: (withAvatar.uid as string) ?? userId,
      role: (withAvatar.role as string) ?? null,
      full_name: (withAvatar.full_name as string) ?? null,
      email: (withAvatar.email as string) ?? null,
      active: withAvatar.active !== false,
      compliance_access: withAvatar.compliance_access === true,
      avatar_id: (withAvatar.avatar_id as string) ?? null,
      avatar_column_available: true,
    }
  }

  const core = await fetchProfileFields(supabase, userId, CORE_FIELDS, options)
  if (!core) return null

  return {
    uid: (core.uid as string) ?? userId,
    role: (core.role as string) ?? null,
    full_name: (core.full_name as string) ?? null,
    email: (core.email as string) ?? null,
    active: core.active !== false,
    compliance_access: core.compliance_access === true,
    avatar_id: null,
    avatar_column_available: false,
  }
}

export async function updateProfileForUser(
  supabase: SupabaseClient,
  userId: string,
  updates: { full_name?: string; avatar_id?: string }
): Promise<{ error: Error | null; avatar_column_available: boolean }> {
  const payload: Record<string, unknown> = { ...updates }
  let { error } = await supabase.from('profiles').update(payload).eq('uid', userId)
  if (!error) return { error: null, avatar_column_available: true }

  if (updates.avatar_id !== undefined) {
    const { error: err2 } = await supabase.from('profiles').update(payload).eq('id', userId)
    if (!err2) return { error: null, avatar_column_available: true }
    error = err2
  }

  const missingAvatar =
    error?.message?.includes('avatar_id') ||
    (error as { code?: string })?.code === 'PGRST204'

  if (missingAvatar && updates.avatar_id !== undefined) {
    const { avatar_id: _drop, ...rest } = updates
    if (Object.keys(rest).length === 0) {
      return {
        error: new Error(
          'Avatar column not in database yet. Run migration 059_staff_avatars.sql on Supabase.'
        ),
        avatar_column_available: false,
      }
    }
    const { error: err3 } = await supabase.from('profiles').update(rest).eq('uid', userId)
    if (!err3) return { error: null, avatar_column_available: false }
    const { error: err4 } = await supabase.from('profiles').update(rest).eq('id', userId)
    return { error: err4 ? new Error(err4.message) : null, avatar_column_available: false }
  }

  return { error: error ? new Error(error.message) : null, avatar_column_available: true }
}
