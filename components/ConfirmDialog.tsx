'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '@/lib/i18n'

type ConfirmDialogAccent = 'violet' | 'purple' | 'blue'

type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  accent?: ConfirmDialogAccent
  loading?: boolean
  icon?: ReactNode
}

const ACCENT_CONFIRM: Record<ConfirmDialogAccent, string> = {
  violet: 'bg-violet-600 hover:bg-violet-700 focus-visible:ring-violet-500/50',
  purple: 'bg-purple-600 hover:bg-purple-700 focus-visible:ring-purple-500/50',
  blue: 'bg-[#2E6EF3] hover:bg-[#1f5ad2] focus-visible:ring-[#2E6EF3]/50',
}

const ACCENT_ICON: Record<ConfirmDialogAccent, string> = {
  violet: 'bg-violet-100 text-violet-700',
  purple: 'bg-purple-100 text-purple-700',
  blue: 'bg-blue-100 text-blue-700',
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  accent = 'blue',
  loading = false,
  icon,
}: ConfirmDialogProps) {
  const { t } = useT()
  const [submitting, setSubmitting] = useState(false)
  const busy = loading || submitting

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, busy])

  if (!open) return null

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setSubmitting(false)
    }
  }

  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500/50 text-white'
      : `${ACCENT_CONFIRM[accent]} text-white`

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex gap-4">
            {icon ?? (
              <div
                className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${
                  variant === 'danger' ? 'bg-red-100 text-red-600' : ACCENT_ICON[accent]
                }`}
                aria-hidden
              >
                {variant === 'danger' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 id="confirm-dialog-title" className="text-lg font-bold text-slate-900">
                {title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={`h-10 px-4 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 ${confirmBtnClass}`}
          >
            {busy ? t('common.saving') : (confirmLabel ?? t('common.confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}
