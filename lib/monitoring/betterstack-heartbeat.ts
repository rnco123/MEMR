/**
 * Better Stack heartbeat monitoring (server-only, persistent process).
 *
 * - Server: BETTERSTACK_HEARTBEAT_URL — unique ping URL from a Better Stack Uptime heartbeat monitor.
 * - Server: BETTERSTACK_HEARTBEAT_INTERVAL_MS — optional, defaults to 60000 (1 minute).
 *
 * Per monitoring rules, Better Stack is enabled only in production — inactive in
 * development/staging regardless of whether the URL is set, and inactive everywhere until
 * BETTERSTACK_HEARTBEAT_URL is set. Pings on an interval so Better Stack alerts if this
 * server process stops running. Requires a long-lived process (e.g. Railway) — a
 * serverless/edge deployment would never keep the interval alive.
 */

import { isProduction } from '@/lib/config/environment'

const DEFAULT_INTERVAL_MS = 60_000

export function isBetterStackHeartbeatEnabled(): boolean {
  return isProduction && Boolean(process.env.BETTERSTACK_HEARTBEAT_URL)
}

export function startBetterStackHeartbeat(): void {
  const url = process.env.BETTERSTACK_HEARTBEAT_URL
  if (!isBetterStackHeartbeatEnabled() || !url) return

  const intervalMs = Number(process.env.BETTERSTACK_HEARTBEAT_INTERVAL_MS) || DEFAULT_INTERVAL_MS

  const ping = () => {
    fetch(url).catch((err) => {
      console.error('[betterstack] heartbeat ping failed:', err)
    })
  }

  ping()
  setInterval(ping, intervalMs)
}
