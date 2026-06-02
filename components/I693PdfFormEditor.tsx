'use client'

import 'pdfjs-dist/web/pdf_viewer.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useT } from '@/lib/i18n'

const DEFAULT_SCALE = 1.2
const MIN_SCALE = 0.75
const MAX_SCALE = 2

type Props = {
  encounterId: number
  patientName?: string
}

export function I693PdfFormEditor({ encounterId, patientName }: Props) {
  const { t } = useT()
  const [loading, setLoading] = useState(true)
  const [formReady, setFormReady] = useState(false)
  const [pdfReady, setPdfReady] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [scale, setScale] = useState(DEFAULT_SCALE)
  const hostRef = useRef<HTMLDivElement>(null)
  const bytesRef = useRef<Uint8Array | null>(null)

  const fetchFilledPdfBytes = useCallback(async (): Promise<Uint8Array> => {
    const res = await fetch(`/api/encounters/${encounterId}/i693/pdf`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || json.message || `PDF export failed (${res.status})`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }, [encounterId])

  const renderPdf = useCallback(async (bytes: Uint8Array, nextScale: number) => {
    const host = hostRef.current
    if (!host) {
      throw new Error('PDF preview container not mounted')
    }

    setPdfReady(false)
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

    const pdf = await pdfjs.getDocument({ data: bytes }).promise
    host.innerHTML = ''

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: nextScale })

      const wrap = document.createElement('div')
      wrap.className = 'flex flex-col items-center gap-2 w-full mb-8'
      const label = document.createElement('p')
      label.className = 'text-xs font-medium text-slate-500 self-start'
      label.textContent = `${t('i693.pdf_page')} ${pageNum} / ${pdf.numPages}`
      wrap.appendChild(label)

      const pageBox = document.createElement('div')
      pageBox.className = 'relative shadow-lg bg-white ring-1 ring-slate-200/80'
      pageBox.style.width = `${viewport.width}px`
      pageBox.style.height = `${viewport.height}px`

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.className = 'block'
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      const annotationLayerDiv = document.createElement('div')
      annotationLayerDiv.className = 'annotationLayer absolute inset-0'

      pageBox.appendChild(canvas)
      pageBox.appendChild(annotationLayerDiv)
      wrap.appendChild(pageBox)
      host.appendChild(wrap)

      await page.render({
        canvasContext: ctx,
        viewport,
        annotationMode: pdfjs.AnnotationMode.DISABLE,
      }).promise
    }

    setPdfReady(true)
  }, [t])

  const refreshPreview = useCallback(async () => {
    setPdfLoading(true)
    try {
      const bytes = await fetchFilledPdfBytes()
      bytesRef.current = bytes
      setFormReady(true)
      await renderPdf(bytes, scale)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF preview failed to load')
    } finally {
      setLoading(false)
      setPdfLoading(false)
    }
  }, [fetchFilledPdfBytes, renderPdf, scale])

  useEffect(() => {
    void refreshPreview()
  }, [refreshPreview])

  useEffect(() => {
    if (!formReady || !bytesRef.current) return
    const host = hostRef.current
    if (!host) return

    void (async () => {
      try {
        await renderPdf(bytesRef.current!, scale)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'PDF preview failed to load')
      }
    })()

    return () => {
      host.innerHTML = ''
      setPdfReady(false)
    }
  }, [formReady, renderPdf, scale])

  const downloadPdf = async () => {
    setPdfLoading(true)
    try {
      const bytes = await fetchFilledPdfBytes()
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `I-693-encounter-${encounterId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('i693.pdf_filled'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF failed')
    } finally {
      setPdfLoading(false)
    }
  }

  if (loading && !formReady) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message={t('i693.pdf_editor_loading')} variant="light" />
      </div>
    )
  }

  return (
    <div className="space-y-4 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {t('i693.pdf_editor_title')}
            {patientName ? ` — ${patientName}` : ''}
          </h2>
          <p className="text-sm text-slate-500 mt-1">{t('i693.encounter_label')} {encounterId}</p>
          <p className="text-xs text-slate-500 mt-2 max-w-2xl">{t('i693.pdf_editor_hint')}</p>
          {pdfReady && (
            <p className="text-xs text-emerald-700 mt-1 font-medium">
              Read-only custom preview. Edit values in Digital form, then refresh here.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshPreview()}
            disabled={pdfLoading}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium disabled:opacity-50"
          >
            {pdfLoading ? t('i693.pdf_running') : 'Refresh preview'}
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, Number((s - 0.1).toFixed(2))))}
            disabled={pdfLoading}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium disabled:opacity-50"
          >
            Zoom -
          </button>
          <div className="px-3 py-2 text-sm text-slate-600">{Math.round(scale * 100)}%</div>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, Number((s + 0.1).toFixed(2))))}
            disabled={pdfLoading}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium disabled:opacity-50"
          >
            Zoom +
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={pdfLoading}
            className="px-4 py-2 rounded-lg bg-[#2E6EF3] hover:bg-[#1f5ad2] text-white text-sm font-medium disabled:opacity-50"
          >
            {t('i693.download_pdf')}
          </button>
        </div>
      </div>

      <div className="relative bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden max-h-[calc(100vh-14rem)]">
        {!pdfReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
            <LoadingSpinner message={t('i693.pdf_editor_loading')} variant="light" />
          </div>
        )}
        <div
          ref={hostRef}
          className="i693-pdfjs-editor min-h-[480px] p-4 md:p-6 overflow-auto max-h-[calc(100vh-14rem)]"
        />
      </div>
    </div>
  )
}
