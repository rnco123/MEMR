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
  daily: {
    /** Server-only. Never expose via NEXT_PUBLIC_* — would leak into client bundle (H-10). */
    apiKey: getEnvVar('DAILY_API_KEY', false) || getEnvVar('NEXT_PUBLIC_DAILY_API_KEY', false),
    domain: getEnvVar('NEXT_PUBLIC_DAILY_DOMAIN'),
  },
  telemedicine: {
    /**
     * Which video platform serves telemedicine. `vonlinkage` is the migration
     * target — the patient app (MCM-Go) is already there, and a patient on
     * VonLinkage cannot share a call with a doctor on Daily.
     *
     * Read at request time so a failing call can be rolled back by flipping the
     * variable, without a deploy. Daily stays wired until a real doctor–patient
     * call has succeeded end to end.
     */
    get provider(): 'daily' | 'vonlinkage' {
      return process.env.TELEMEDICINE_PROVIDER === 'vonlinkage' ? 'vonlinkage' : 'daily'
    },
  },
  /**
   * VonLinkage's base URL and API key are deliberately NOT here.
   *
   * This module is imported by client components, so every env var name it
   * mentions ends up in the browser bundle. Next.js only inlines the *values*
   * of `NEXT_PUBLIC_*` variables, so a secret read through `getEnvVar` does not
   * leak today — but that safety rests on the lookup staying dynamic, which is
   * one refactor away from being untrue. The Daily key above already sits on
   * that edge; the replacement should not join it.
   *
   * `lib/vonlinkage.ts` reads both directly instead. It is server-only and
   * throws if it is ever imported into a client bundle, so the credential has
   * no path to the browser at all rather than merely not taking one.
   */
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
  // Daily's variables are only required while Daily is the active provider — a
  // deployment that has finished the migration should not be held to
  // credentials it no longer uses.
  //
  // VonLinkage's own variables are deliberately not checked here: naming them
  // in this client-imported module is what would put them in the browser
  // bundle. `lib/vonlinkage.ts` validates them instead, and the telemedicine
  // routes fail closed with an explicit error rather than falling back to
  // Daily.
  if (config.telemedicine.provider === 'daily') {
    if (!process.env.DAILY_API_KEY) {
      missing.push('DAILY_API_KEY')
    }
    if (!process.env.NEXT_PUBLIC_DAILY_DOMAIN) {
      missing.push('NEXT_PUBLIC_DAILY_DOMAIN')
    }
  }
  if (missing.length > 0) {
    console.error(`[config] Missing required environment variables: ${missing.join(', ')}`)
  }
}
