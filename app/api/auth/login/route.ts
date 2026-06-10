import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { resolveAuthenticatedRole } from '@/lib/admin-auth'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type PendingCookie = { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }

/**
 * Server-side login so browsers on restricted networks (DNS blocks *.supabase.co)
 * only talk to memr.myclinicmd.com; the app server resolves Supabase and sets auth cookies.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError('Email and password are required')
    }

    const cookieStore = await cookies()
    const pendingCookies: PendingCookie[] = []

    const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
              pendingCookies.push({ name, value, options })
            })
          } catch {
            // Ignore if called from Server Component context
          }
        },
      },
    })

    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email.trim(),
      password: parsed.data.password,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Invalid login credentials' },
        { status: 401 }
      )
    }

    const user = data.user
    if (!user) {
      return NextResponse.json({ error: 'Sign in failed' }, { status: 401 })
    }

    const role = await resolveAuthenticatedRole(supabase, user)

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      },
      role,
    })

    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })

    return response
  } catch (e) {
    return handleApiError(e)
  }
}
