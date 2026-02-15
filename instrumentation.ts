/**
 * Sentry instrumentation for Next.js App Router
 * This file is required for Sentry to work properly with Next.js 13+ App Router
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
