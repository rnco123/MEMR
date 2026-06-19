import { createClient } from '@/lib/supabase/server'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'
import { NextRequest } from 'next/server'
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js'

export function getAccessTokenFromCookie(request: NextRequest): string | null {
  const authCookie = request.cookies.get('supabase.auth.token')
  if (!authCookie?.value) return null

  try {
    const base64Part = authCookie.value.replace('base64-', '')
    const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
    const sessionData = JSON.parse(decoded)
    return sessionData?.access_token || null
  } catch {
    return null
  }
}

export async function getUserFromCustomCookie(request: NextRequest): Promise<User | null> {
  const token = getAccessTokenFromCookie(request)
  if (!token) return null

  try {
    const supabase = createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return user
  } catch {
    /* ignore */
  }
  return null
}

/** Resolve current user from session, getUser(), or legacy cookie. */
export async function resolveChatUser(request: NextRequest): Promise<User | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user

  const { data: { user: fromGetUser } } = await supabase.auth.getUser()
  if (fromGetUser) return fromGetUser

  return getUserFromCustomCookie(request)
}

/** Supabase client with user JWT for RLS-backed chat queries. */
export async function getChatSupabaseClient(request: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    })
  }

  const token = getAccessTokenFromCookie(request)
  if (token) {
    return createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
  }

  return supabase
}

import { CLINICAL_STAFF_WITH_ADMIN_ROLE_VALUES } from '@/lib/roles'

/** Staff roles allowed in 1:1 chat directory. */
export const CHAT_ELIGIBLE_ROLES = CLINICAL_STAFF_WITH_ADMIN_ROLE_VALUES

export function sortParticipantIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}
