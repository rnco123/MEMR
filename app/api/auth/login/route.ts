import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { resolveAuthenticatedRole } from '@/lib/admin-auth'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'
import { z } from 'zod'
import { createRateLimiter } from '@/lib/rate-limit'
import { isTurnstileEnabled, verifyTurnstileToken } from '@/lib/security/turnstile'

export const dynamic = 'force-dynamic'

// M-08a: Dedicated stricter rate limit for login — 5 attempts per 15 min per IP.
const loginRateLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 })

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  turnstileToken: z.string().nullable().optional(),
})

type PendingCookie = { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }

/**
 * Server-side login so browsers on restricted networks (DNS blocks *.supabase.co)
 * only talk to memr.myclinicmd.com; the app server resolves Supabase and sets auth cookies.
 */
export async function POST(request: NextRequest) {
  try {
    // M-08a: Enforce per-IP brute-force throttle on login.
    const ip =
      request.ip ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    if (!loginRateLimiter(ip)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      )
    }

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

    // CAPTCHA gate — enforced once TURNSTILE_SECRET_KEY is configured; verified server-side, never trust the client.
    if (isTurnstileEnabled()) {
      const captchaOk = await verifyTurnstileToken(parsed.data.turnstileToken ?? '', ip)
      if (!captchaOk) {
        return NextResponse.json(
          { error: 'Captcha verification failed. Please refresh and try again.' },
          { status: 400 }
        )
      }
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
