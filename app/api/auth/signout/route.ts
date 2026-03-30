import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function POST() {
  const cookieStore = await cookies()
  const response = NextResponse.json({ success: true })

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (value === '') {
                // Clear cookie by setting it with empty value and past expiration
                cookieStore.delete(name)
                response.cookies.delete(name)
              } else {
                cookieStore.set(name, value, options)
                response.cookies.set(name, value, options)
              }
            })
          } catch {
            // Ignore if called from Server Component
          }
        },
      },
    }
  )

  // Sign out from Supabase - this will clear session cookies
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Sign out error:', error)
    // Still try to clear cookies even if signOut fails
  }

  // Explicitly clear all Supabase auth cookies by setting them to empty with past expiration
  const allCookies = cookieStore.getAll()
  allCookies.forEach((cookie) => {
    if (
      cookie.name.includes('sb-') ||
      cookie.name.includes('supabase') ||
      cookie.name.includes('auth-token') ||
      cookie.name.includes('access-token') ||
      cookie.name.includes('refresh-token')
    ) {
      // Delete from cookie store
      cookieStore.delete(cookie.name)
      // Clear in response by setting empty value with past expiration
      response.cookies.set(cookie.name, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      })
    }
  })

  return response
}
