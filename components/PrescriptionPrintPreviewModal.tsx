'use client'

import { useEffect, useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useT } from '@/lib/i18n'
import type { PrescriptionPrintContext } from '@/lib/prescriptions/load-prescription-print-context'
import { buildUsPrescriptionPrintHtml } from '@/lib/prescriptions/us-prescription-print'

type Props = {
  open: boolean
  onClose: () => void
  encounterId: number | null
  prescriptionIds: number[]
  subtitle?: string
}

export function PrescriptionPrintPreviewModal({
  open,
  onClose,
  encounterId,
  prescriptionIds,
  subtitle,
}: Props) {
  const { t } = useT()
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  const printPreview = () => {
    const frameWin = previewFrameRef.current?.contentWindow
    if (!frameWin) return
    try {
      frameWin.focus()
      frameWin.print()
    } catch {
      /* browser blocked print */
    }
  }

  useEffect(() => {
    if (!open || encounterId == null || prescriptionIds.length === 0) {
      setPreviewHtml(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setPreviewHtml(null)

    void (async () => {
      try {
        const res = await fetch(
          `/api/encounters/${encounterId}/prescriptions/print-data?prescription_ids=${prescriptionIds.join(',')}`,
          { credentials: 'include' }
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || t('admin.prescriptions.preview_failed'))
        if (cancelled) return
        setPreviewHtml(buildUsPrescriptionPrintHtml(json.data as PrescriptionPrintContext))
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : t('admin.prescriptions.preview_failed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [encounterId, open, prescriptionIds, t])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rx-preview-title"
      onClick={() => {
        if (!loading) onClose()
      }}
    >
      <div
        className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 id="rx-preview-title" className="text-lg font-bold text-slate-900">
              {t('admin.prescriptions.preview_title')}
            </h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500 truncate">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={printPreview}
              disabled={loading || !previewHtml}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('common.print')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              aria-label={t('common.close')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-100">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <p className="px-5 py-12 text-center text-sm text-red-600">{error}</p>
          ) : previewHtml ? (
            <iframe
              ref={previewFrameRef}
              title={t('admin.prescriptions.preview_title')}
              srcDoc={previewHtml}
              className="w-full min-h-[70vh] border-0 bg-white"
              sandbox="allow-same-origin allow-modals"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
