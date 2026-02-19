/**
 * Sentry client-side configuration
 * Only initializes if NEXT_PUBLIC_SENTRY_DSN is provided
 */

import * as Sentry from '@sentry/nextjs'

// Only initialize Sentry if DSN is provided
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    
    // Enable logs to be sent to Sentry
    enableLogs: true,
    
    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Capture 100% of the transactions for performance monitoring in development
    // Reduce in production
    replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // If the entire session is not sampled, use the below sample rate to sample
    // sessions when an error occurs.
    replaysOnErrorSampleRate: 1.0,
    
    integrations: [
      // Send console.log, console.warn, and console.error calls as logs to Sentry
      ...(typeof Sentry.consoleLoggingIntegration === 'function'
        ? [
            Sentry.consoleLoggingIntegration({
              levels: ['log', 'warn', 'error'],
            }),
          ]
        : []),
      // Conditionally add replay integration if available
      ...(typeof Sentry.replayIntegration === 'function'
        ? [
            Sentry.replayIntegration({
              maskAllText: false,
              blockAllMedia: false,
            }),
          ]
        : []),
    ],
    
    // Filter out sensitive data
    beforeSend(event, hint) {
      // Allow errors in development for testing (remove this check if you want to test)
      // Uncomment the line below to disable Sentry in development:
      // if (process.env.NODE_ENV === 'development') { return null }
      
      // Remove sensitive information
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url)
          url.searchParams.forEach((value, key) => {
            if (key.toLowerCase().includes('password') || key.toLowerCase().includes('pin')) {
              url.searchParams.set(key, '[REDACTED]')
            }
          })
          event.request.url = url.toString()
        } catch {
          // Invalid URL, skip
        }
      }
      
      return event
    },
  })
}
