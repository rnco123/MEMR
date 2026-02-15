'use client'

/**
 * Global error handler for Next.js App Router
 * This catches errors that occur during React rendering
 */

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to Sentry
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
  }, [error])

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
          <div className="max-w-md w-full mx-4">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
              <p className="text-blue-200 mb-6">
                {error.message || 'An unexpected error occurred'}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={reset}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
                >
                  Try again
                </button>
                <button
                  onClick={() => (window.location.href = '/')}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors border border-white/20"
                >
                  Go home
                </button>
              </div>
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-6 text-left">
                  <summary className="text-blue-300 cursor-pointer text-sm">Error details</summary>
                  <pre className="mt-2 text-xs text-red-300 bg-black/20 p-4 rounded overflow-auto">
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
