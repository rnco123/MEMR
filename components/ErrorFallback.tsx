'use client'

type ErrorFallbackProps = {
  error: Error
  onRetry: () => void
  onGoHome?: () => void
}

export function ErrorFallback({ error, onRetry, onGoHome }: ErrorFallbackProps) {
  const goHome = onGoHome ?? (() => {
    window.location.href = '/'
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#eef2ff] px-4 py-10">
      <div className="max-w-md w-full">
        <div className="rounded-[28px] bg-white shadow-[0_24px_80px_rgba(30,64,175,0.14)] border border-[#e6ebff] p-8 sm:p-10 text-center">
          <div className="w-14 h-14 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-rose-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            {error.message || 'An unexpected error occurred'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={onRetry}
              className="px-6 py-3 bg-[#2E6EF3] hover:bg-[#256ae8] text-white rounded-xl text-sm font-semibold transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/50"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={goHome}
              className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-colors border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/80"
            >
              Go home
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-8 text-left">
              <summary className="text-slate-500 cursor-pointer text-sm font-medium hover:text-slate-700">
                Error details
              </summary>
              <pre className="mt-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 p-4 rounded-xl overflow-auto max-h-48">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
