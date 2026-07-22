'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  loadPdfDocumentFromUrl,
  PATIENT_FILE_PDF_VIEW_SCALE,
  renderPdfPageToCanvas,
} from '@/lib/patient-documents/pdf-canvas-render'
import { useT } from '@/lib/i18n'

type ZoomMode = 'fit-width' | 100 | 125 | 150

const ZOOM_MODES: ZoomMode[] = ['fit-width', 100, 125, 150]

type Props = {
  url: string
  title: string
}

export function PatientPdfViewer({ url, title }: Props) {
  const { t } = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const renderTokenRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width')
  const [pageWidths, setPageWidths] = useState<number[]>([])

  const renderPdf = useCallback(async () => {
    const host = hostRef.current
    const viewport = viewportRef.current
    if (!host || !viewport) return

    const token = ++renderTokenRef.current
    const isStale = () => token !== renderTokenRef.current

    setLoading(true)
    setError(null)
    host.innerHTML = ''

    try {
      const pdf = await loadPdfDocumentFromUrl(url)
      if (isStale()) return

      const availW = Math.max(320, viewport.clientWidth - 24)
      const widths: number[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (isStale()) return

        const page = await pdf.getPage(pageNum)
        if (isStale()) return

        const baseScale =
          zoomMode === 'fit-width'
            ? availW / page.getViewport({ scale: 1 }).width
            : (zoomMode / 100) * PATIENT_FILE_PDF_VIEW_SCALE

        const wrap = document.createElement('div')
        wrap.className = 'mx-auto mb-5 w-fit'

        const canvas = document.createElement('canvas')
        canvas.className = 'block rounded-lg border border-slate-200 bg-white shadow-sm'
        canvas.setAttribute('role', 'img')
        canvas.setAttribute(
          'aria-label',
          t('patient_file.pdf_page_label', { page: pageNum, total: pdf.numPages, title })
        )

        wrap.appendChild(canvas)
        host.appendChild(wrap)

        const size = await renderPdfPageToCanvas(page, canvas, baseScale)
        widths.push(size.width)
      }

      if (!isStale()) {
        setPageWidths(widths)
      }
    } catch (e) {
      if (!isStale()) {
        setError(e instanceof Error ? e.message : t('patient_file.pdf_load_failed'))
      }
    } finally {
      if (!isStale()) {
        setLoading(false)
      }
    }
  }, [title, t, url, zoomMode])

  useEffect(() => {
    void renderPdf()
    return () => {
      renderTokenRef.current += 1
    }
  }, [renderPdf])

  const zoomLabel =
    zoomMode === 'fit-width' ? t('patient_file.pdf_zoom_fit_width') : `${zoomMode}%`

  return (
    <div className="flex h-full min-h-[480px] flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs font-medium text-slate-600">
          {pageWidths.length > 0
            ? t('patient_file.pdf_page_count', { count: pageWidths.length })
            : title}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {ZOOM_MODES.map((mode) => {
            const active = zoomMode === mode
            const label =
              mode === 'fit-width' ? t('patient_file.pdf_zoom_fit_width') : `${mode}%`
            return (
              <button
                key={String(mode)}
                type="button"
                onClick={() => setZoomMode(mode)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#2E6EF3] text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            )
          })}
          <span className="ml-1 text-xs text-slate-500">{zoomLabel}</span>
        </div>
      </div>

      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto rounded-xl bg-slate-100/80 p-3">
        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <LoadingSpinner message={t('patient_file.pdf_loading')} variant="dark" size="sm" />
          </div>
        ) : null}
        {error ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-[#2E6EF3] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f5ad2]"
            >
              {t('patient_file.open_new_tab')}
            </a>
          </div>
        ) : null}
        <div ref={hostRef} className={loading || error ? 'hidden' : undefined} />
      </div>
    </div>
  )
}
