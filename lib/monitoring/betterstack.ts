/**
 * Better Stack log forwarding (server-only).
 *
 * - Server: BETTERSTACK_SOURCE_TOKEN — never expose to the client.
 * - Server: BETTERSTACK_INGESTING_HOST — optional, defaults to Better Stack's shared ingest host.
 *
 * Per monitoring rules, Better Stack is enabled only in production — inactive in
 * development/staging regardless of whether the token is set, and inactive everywhere
 * until BETTERSTACK_SOURCE_TOKEN is set. Calls become no-ops; mirrors
 * lib/security/turnstile.ts: never throws, logs locally on failure.
 */

import { Logtail } from '@logtail/node'
import { isProduction } from '@/lib/config/environment'

let client: Logtail | null | undefined

export function isBetterStackLoggingEnabled(): boolean {
  return isProduction && Boolean(process.env.BETTERSTACK_SOURCE_TOKEN)
}

function getClient(): Logtail | null {
  if (client !== undefined) return client
  const token = process.env.BETTERSTACK_SOURCE_TOKEN
  if (!isBetterStackLoggingEnabled() || !token) {
    client = null
    return client
  }
  const host = process.env.BETTERSTACK_INGESTING_HOST
  client = host ? new Logtail(token, { endpoint: `https://${host}` }) : new Logtail(token)
  return client
}

/** Forward an error to Better Stack. Never throws — failures are logged locally only. */
export function logErrorToBetterStack(error: unknown, context?: Record<string, unknown>): void {
  const logtail = getClient()
  if (!logtail) return

  try {
    const message = error instanceof Error ? error.message : String(error)
    void logtail
      .error(message, {
        ...context,
        stack: error instanceof Error ? error.stack : undefined,
      })
      .catch((err: unknown) => {
        console.error('[betterstack] forwarding failed:', err)
      })
  } catch (err) {
    console.error('[betterstack] forwarding failed:', err)
  }
}
