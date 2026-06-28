/**
 * Cloudflare Turnstile CAPTCHA (login only).
 *
 * - Public: NEXT_PUBLIC_TURNSTILE_SITE_KEY — safe for the browser widget.
 * - Server: TURNSTILE_SECRET_KEY — never expose to the client.
 *
 * Enforcement is gated on TURNSTILE_SECRET_KEY being set, so login isn't blocked
 * before the keys are configured. Once set, every login attempt is verified server-side.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Safe for browser use — reads the public site key. */
export function getTurnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
}

/** Server-only — whether login should require/verify a Turnstile token. */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY)
}

/** Server-only — verify a Turnstile token with Cloudflare. Never trust a client-reported "success". */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret || !token) return false

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (err) {
    console.error('[turnstile] verification request failed:', err)
    return false
  }
}
