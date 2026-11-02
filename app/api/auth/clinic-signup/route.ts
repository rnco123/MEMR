import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { bridgePost } from '@/lib/bridge/sync'
import { peekRateLimit, recordAttempt } from '@/lib/rate-limit'
import { isTurnstileEnabled, verifyTurnstileToken } from '@/lib/security/turnstile'
import { signupRequestCreateSchema } from '@/lib/signup-requests/types'

export const dynamic = 'force-dynamic'

// Every attempt counts, not only failures: each success creates an auth user.
const SIGNUP_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 }

function tooManyAttempts(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many signup attempts. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } }
  )
}

/**
 * Public clinic signup. Records a request for MEMR to approve; the bridge creates the
 * (banned) auth user and the request row. Nothing gets a role, tenant or location until
 * an admin approves it in Admin → Signups.
 */
export async function POST(request: NextRequest) {
  try {
    const ip =
      request.ip ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    const rlKey = `clinic-signup:${ip}`
    const preCheck = peekRateLimit(rlKey, SIGNUP_RATE_LIMIT)
    if (preCheck.blocked) return tooManyAttempts(preCheck.retryAfterMs)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = signupRequestCreateSchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError('Please check the highlighted fields', { issues: parsed.error.issues })
    }
    const { turnstileToken, ...fields } = parsed.data

    if (isTurnstileEnabled()) {
      const captchaOk = await verifyTurnstileToken(turnstileToken ?? '', ip)
      if (!captchaOk) {
        return NextResponse.json(
          { error: 'Captcha verification failed. Please refresh and try again.' },
          { status: 400 }
        )
      }
    }

    const status = recordAttempt(rlKey, SIGNUP_RATE_LIMIT)
    if (status.blocked) return tooManyAttempts(status.retryAfterMs)

    await bridgePost<{ id: string }>('/clinic-signups', fields)

    return NextResponse.json({ success: true, status: 'pending' })
  } catch (e) {
    return handleApiError(e)
  }
}
