/**
 * Next.js App Router instrumentation hook — runs once per server process at boot,
 * before any request is handled. Importing lib/config/environment.ts here makes APP_ENV
 * validation the very first thing that runs: an invalid/missing APP_ENV crashes the
 * process immediately instead of surfacing as a confusing failure later.
 */

import '@/lib/config/environment'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
    const { startBetterStackHeartbeat } = await import('./lib/monitoring/betterstack-heartbeat')
    startBetterStackHeartbeat()
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
