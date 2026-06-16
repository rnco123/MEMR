'use client'

import { useEffect } from 'react'

type MobileSheetProps = {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  /** Optional right-aligned header action (e.g. a save button). */
  headerAction?: React.ReactNode
  children: React.ReactNode
  /** Max height of the sheet. Defaults to 85% of the dynamic viewport. */
  maxHeightClassName?: string
  className?: string
}

/**
 * App-style bottom sheet for mobile (phone) surfaces — modals, detail panels,
 * filters. Edge-to-edge, safe-area aware, with a grab handle and backdrop.
 *
 * Intended to be rendered conditionally on mobile; desktop should keep its own
 * dialog/panel patterns. Lightweight (CSS transitions only).
 */
export function MobileSheet({
  open,
  onClose,
  title,
  headerAction,
  children,
  maxHeightClassName = 'max-h-[min(88dvh,820px)]',
  className = '',
}: MobileSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px] animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl animate-sheet-up pb-safe ${maxHeightClassName} ${className}`}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden />
        </div>
        {(title || headerAction) && (
          <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-1">
            <div className="min-w-0 text-base font-semibold text-slate-900 truncate">{title}</div>
            <div className="flex shrink-0 items-center gap-2">
              {headerAction}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}
