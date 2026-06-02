'use client'

/**
 * Global error handler for Next.js App Router
 * This catches errors that occur during React rendering
 */

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { isAbortError } from '@/lib/is-abort-error'
import { ErrorFallback } from '@/components/ErrorFallback'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (isAbortError(error)) {
      reset()
      return
    }
    Sentry.captureException(error, {
      tags: {
        errorBoundary: 'global-error',
      },
      contexts: {
        error: {
          digest: error.digest,
        },
      },
    })
  }, [error, reset])

  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorFallback error={error} onRetry={reset} />
      </body>
    </html>
  )
}
