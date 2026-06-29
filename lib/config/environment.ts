/**
 * Single source of truth for the application's deployment tier.
 *
 * APP_ENV is distinct from NODE_ENV: NODE_ENV is Next.js's build mode
 * (development|production, set by `next dev`/`next build`) and still governs things
 * like dev-only console logging and CSP. APP_ENV is the deployment tier — it's what
 * separates Railway staging from Railway production, which NODE_ENV cannot express
 * (both run NODE_ENV=production).
 *
 * Baked into both server and client bundles via the `env` block in next.config.js
 * (the same mechanism already used there for NEXT_PUBLIC_SUPABASE_URL), so this
 * module is safe to import from client components too.
 *
 * Every feature must branch on these exports instead of reading
 * process.env.APP_ENV directly.
 */

const ALLOWED_APP_ENVS = ['development', 'staging', 'production'] as const

export type AppEnv = (typeof ALLOWED_APP_ENVS)[number]

function resolveAppEnv(): AppEnv {
  const raw = process.env.APP_ENV
  if (!raw || !(ALLOWED_APP_ENVS as readonly string[]).includes(raw)) {
    throw new Error(
      `[environment] APP_ENV is missing or invalid (got: ${JSON.stringify(raw)}). ` +
        `Set APP_ENV to one of: ${ALLOWED_APP_ENVS.join(', ')}.`
    )
  }
  return raw as AppEnv
}

export const appEnv: AppEnv = resolveAppEnv()
export const isDevelopment = appEnv === 'development'
export const isStaging = appEnv === 'staging'
export const isProduction = appEnv === 'production'
