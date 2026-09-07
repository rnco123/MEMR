/**
 * Centralized configuration with environment variable validation
 * Throws errors on startup if required variables are missing
 */

function getEnvVar(key: string, required = true): string {
  const value = process.env[key]
  if (required && !value && process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
    const isBuildTime =
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.env.NEXT_PHASE === 'phase-development-build'
    if (!isBuildTime) {
      // Do not throw — throwing on import causes opaque "Internal Server Error" for every route.
      console.error(`[config] Missing required environment variable: ${key}`)
    }
  }
  return value || ''
}

const supabasePublishable =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/**
 * VonLinkage's base URL and API key are deliberately absent from this file.
 *
 * This module is imported by client components, so every env var name it
 * mentions ends up in the browser bundle. Next.js only inlines the *values* of
 * `NEXT_PUBLIC_*` variables, so a secret read through `getEnvVar` would not leak
 * today — but that safety rests on the lookup staying dynamic, which is one
 * refactor away from being untrue.
 *
 * `lib/vonlinkage.ts` reads both directly instead. It is server-only and throws
 * if it is ever imported into a client bundle, so the credential has no path to
 * the browser at all rather than merely not taking one.
 */
export const config = {
  supabase: {
    url: getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
    /** Publishable (sb_publishable_…) or legacy anon JWT */
    publishableKey: supabasePublishable,
    /** Secret (sb_secret_…) or legacy service_role JWT */
    secretKey: supabaseSecret,
    /** @deprecated use publishableKey */
    anonKey: supabasePublishable,
    /** @deprecated use secretKey */
    serviceRoleKey: supabaseSecret,
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
  },
  sentry: {
    dsn: getEnvVar('NEXT_PUBLIC_SENTRY_DSN', false), // Optional
  },
  /** Server-only: nurse risk alerts (OpenAI). */
  openai: {
    apiKey: getEnvVar('OPENAI_API_KEY', false),
  },
  /** Server-only: I-693 TB report analysis (Anthropic). */
  anthropic: {
    apiKey: getEnvVar('ANTHROPIC_API_KEY', false),
  },
  /** Server-only: Resend transactional email (e.g. SOAP notes to patients). */
  email: {
    resendApiKey: getEnvVar('RESEND_API_KEY', false),
    fromEmail: getEnvVar('RESEND_FROM_EMAIL', false),
    fromName: getEnvVar('RESEND_FROM_NAME', false) || 'MyClinicMD',
  },
} as const

// Validate critical config on module load — server only (client never has SERVICE_ROLE)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' ||
                    process.env.NEXT_PHASE === 'phase-development-build' ||
                    process.env.NEXT_PHASE === 'phase-export'
const isServer = typeof window === 'undefined'

if (config.app.isProduction && !isBuildTime && isServer) {
  const missing: string[] = []
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabasePublishable) {
    missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  if (!supabaseSecret) {
    missing.push('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY')
  }
  if (missing.length > 0) {
    console.error(`[config] Missing required environment variables: ${missing.join(', ')}`)
  }
}
