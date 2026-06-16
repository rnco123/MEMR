import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { config } from '@/lib/config'

export async function getUserFromRequest(request: Request): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (!error && user) return user
  }

  const supabaseServer = await createServerClient()
  const {
    data: { user },
    error,
  } = await supabaseServer.auth.getUser()
  if (error || !user) return null
  return user
}

export function getSupabaseForRequest(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (token) {
    return createClient(config.supabase.url, config.supabase.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
  }
  return null
}
