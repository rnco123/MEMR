import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { resolveDisplayName } from '@/lib/display-name'
import { fetchProfileFields } from '@/lib/fetch-user-role'

export const FORM_SELECT =
  'id, tenant_id, name, is_active, content, created_at, updated_at, updated_by, updated_by_name'

export type FormApiRow = {
  id: number
  tenant_id: number
  name: string
  is_active: boolean
  html: string
  content_updated_at: string | null
  created_at: string | null
  updated_at: string | null
  updated_by: string | null
  updated_by_name: string | null
}

export function rowToApi(row: Record<string, unknown>): FormApiRow {
  const content = row.content as { html?: string; updated_at?: string } | null
  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    name: String(row.name ?? ''),
    is_active: Boolean(row.is_active),
    html: typeof content?.html === 'string' ? content.html : '',
    content_updated_at: content?.updated_at ?? null,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? content?.updated_at ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    updated_by_name: (row.updated_by_name as string | null) ?? null,
  }
}

export async function resolveAdminFormUpdater(
  admin: SupabaseClient,
  user: User
): Promise<{ updated_by: string; updated_by_name: string }> {
  const profile = await fetchProfileFields(admin, user.id, 'full_name, email', { email: user.email })
  return {
    updated_by: user.id,
    updated_by_name: resolveDisplayName({
      full_name: typeof profile?.full_name === 'string' ? profile.full_name : null,
      email: typeof profile?.email === 'string' ? profile.email : user.email,
      fallback: 'Administrator',
    }),
  }
}
