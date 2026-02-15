/**
 * Sentry edge runtime configuration
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
    
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    integrations: [
      // Send console.log, console.warn, and console.error calls as logs to Sentry
      ...(typeof Sentry.consoleLoggingIntegration === 'function'
        ? [
            Sentry.consoleLoggingIntegration({
              levels: ['log', 'warn', 'error'],
            }),
          ]
        : []),
    ],
    
    beforeSend(event) {
      // Allow errors in development for testing (remove this check if you want to test)
      // Uncomment the line below to disable Sentry in development:
      // if (process.env.NODE_ENV === 'development') { return null }
      
      return event
    },
  })
}
