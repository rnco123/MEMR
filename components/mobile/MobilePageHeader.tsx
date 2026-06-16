'use client'

import { useRouter } from 'next/navigation'

type MobilePageHeaderProps = {
  title: string
  subtitle?: string
  /** If provided, renders a back-chevron that pushes this href (or calls back if -1). */
  backHref?: string | -1
  actions?: React.ReactNode
  className?: string
}

/**
 * App-style sticky header for mobile page screens (phones only).
 * Shows on `< lg`; hidden on desktop via `lg:hidden` so it never
 * interferes with the existing desktop top-bar.
 */
export function MobilePageHeader({
  title,
  subtitle,
  backHref,
  actions,
  className = '',
}: MobilePageHeaderProps) {
  const router = useRouter()

  return (
    <header
      className={`lg:hidden sticky top-0 z-30 shrink-0 flex items-center gap-2 px-4 py-3 bg-white/95 backdrop-blur border-b border-slate-100 pt-[max(0.75rem,env(safe-area-inset-top))] ${className}`}
    >
      {backHref !== undefined && (
        <button
          type="button"
          onClick={() => (backHref === -1 ? router.back() : router.push(backHref as string))}
          className="mr-1 -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 active:bg-slate-100"
          aria-label="Back"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-slate-900 leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-slate-500 leading-tight mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}
