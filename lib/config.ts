/**
 * Centralized configuration with environment variable validation
 * Throws errors on startup if required variables are missing
 */

function getEnvVar(key: string, required = true): string {
  const value = process.env[key]
  // Only throw error in production runtime, not during build
  if (required && !value && process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
    // Check if we're in a build context (Next.js build process)
    const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || process.env.NEXT_PHASE === 'phase-development-build'
    if (!isBuildTime) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
  return value || ''
}

export const config = {
  supabase: {
    url: getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
  },
  daily: {
    apiKey: getEnvVar('NEXT_PUBLIC_DAILY_API_KEY'),
    domain: getEnvVar('NEXT_PUBLIC_DAILY_DOMAIN'),
  },
  admin: {
    signupPin: getEnvVar('ADMIN_SIGNUP_PIN'),
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
  },
  sentry: {
    dsn: getEnvVar('NEXT_PUBLIC_SENTRY_DSN', false), // Optional
  },
  soapNotes: {
    apiUrl: getEnvVar('NEXT_PUBLIC_SOAP_NOTES_API_URL', false), // Optional - Complete SOAP Notes API
  },
} as const

// Validate critical config on module load (only in production runtime, not during build)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                     process.env.NEXT_PHASE === 'phase-development-build' ||
                     process.env.NEXT_PHASE === 'phase-export'

if (config.app.isProduction && !isBuildTime) {
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_DAILY_API_KEY',
    'NEXT_PUBLIC_DAILY_DOMAIN',
    'ADMIN_SIGNUP_PIN',
  ]

  const missing = requiredVars.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
