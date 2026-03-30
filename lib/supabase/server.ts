import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Set cookies with extended expiration (24 hours)
              const cookieOptions = {
                ...options,
                maxAge: options?.maxAge || 86400, // 24 hours in seconds
                expires: options?.expires || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
                httpOnly: options?.httpOnly !== false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: options?.sameSite || 'lax' as const,
                path: options?.path || '/',
              }
              cookieStore.set(name, value, cookieOptions)
            })
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
