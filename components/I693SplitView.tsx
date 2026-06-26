'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  type I693SplitViewItem,
  type I693SplitViewSource,
  isSplitViewImage,
  isSplitViewPdf,
  readSplitViewBytes,
} from '@/lib/i693/split-view-document'
import { clonePdfBytes, loadPdfJsDocument } from '@/lib/i693/pdfjs-load'
import { useT } from '@/lib/i18n'

const SPLIT_VIEW_SCALE = 1.05

type Props = {
  items: I693SplitViewItem[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onClosePanel: () => void
  onRemoveDocument?: (index: number) => void
  removable?: boolean
  source?: I693SplitViewSource
  onSourceChange?: (source: I693SplitViewSource) => void
  showSourceToggle?: boolean
}

export function I693SplitView({
  items,
  activeIndex,
  onActiveIndexChange,
  onClosePanel,
  onRemoveDocument,
  removable = false,
  source = 'supporting',
  onSourceChange,
  showSourceToggle = false,
}: Props) {
  const { t } = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const item = items[activeIndex] ?? null

  const renderDocument = useCallback(async () => {
    const host = hostRef.current
    if (!host || !item) return

    setLoading(true)
    setError(null)
    host.innerHTML = ''

    try {
      if (isSplitViewImage(item)) {
        if (item.file) {
          const url = URL.createObjectURL(item.file)
          const img = document.createElement('img')
          img.src = url
          img.alt = item.name
          img.className = 'max-w-full h-auto mx-auto block bg-white shadow-sm border border-slate-200'
          img.onload = () => URL.revokeObjectURL(url)
          host.appendChild(img)
          return
        }
        if (item.url) {
          const img = document.createElement('img')
          img.src = item.url
          img.alt = item.name
          img.className = 'max-w-full h-auto mx-auto block bg-white shadow-sm border border-slate-200'
          host.appendChild(img)
          return
        }
      }

      if (!isSplitViewPdf(item)) {
        throw new Error(t('i693.splitview_unsupported'))
      }

      const bytes = clonePdfBytes(await readSplitViewBytes(item))
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const pdf = await loadPdfJsDocument(pdfjs, bytes)

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: SPLIT_VIEW_SCALE })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) continue

        canvas.width = viewport.width
        canvas.height = viewport.height

        const wrapper = document.createElement('div')
        wrapper.className = 'mb-4 mx-auto w-fit rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden'
        const label = document.createElement('p')
        label.className = 'border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500'
        label.textContent = t('i693.splitview_page', { page: pageNum, total: pdf.numPages })
        wrapper.appendChild(label)
        wrapper.appendChild(canvas)
        host.appendChild(wrapper)

        await page.render({ canvasContext: context, viewport }).promise
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('i693.splitview_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [item, t])

  useEffect(() => {
    void renderDocument()
  }, [renderDocument])

  if (items.length === 0 || !item) return null

  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-violet-200 bg-white shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-10rem)] lg:self-start">
      <div className="flex items-start justify-between gap-3 border-b border-violet-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-violet-900">{t('i693.splitview_title')}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={item.name}>
            {item.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {removable && onRemoveDocument ? (
            <button
              type="button"
              onClick={() => onRemoveDocument(activeIndex)}
              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              title={t('i693.splitview_remove_document')}
            >
              {t('i693.splitview_remove_document')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClosePanel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            title={t('i693.splitview_close')}
            aria-label={t('i693.splitview_close')}
          >
            ✕
          </button>
        </div>
      </div>

      {showSourceToggle && onSourceChange ? (
        <div className="flex flex-wrap gap-2 border-b border-violet-50 px-4 py-2">
          <button
            type="button"
            onClick={() => onSourceChange('supporting')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
              source === 'supporting'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t('i693.splitview_source_supporting')}
          </button>
          <button
            type="button"
            onClick={() => onSourceChange('patient_chart')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
              source === 'patient_chart'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t('i693.splitview_source_patient_chart')}
          </button>
        </div>
      ) : null}

      {items.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-b border-violet-50 px-4 py-2">
          {items.map((doc, index) => (
            <div
              key={doc.key}
              className={`inline-flex max-w-full items-center gap-1 rounded-lg pl-2.5 pr-1 py-1 text-xs font-medium ${
                index === activeIndex
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => onActiveIndexChange(index)}
                className="max-w-[180px] truncate text-left"
                title={doc.name}
              >
                {doc.name}
              </button>
              {removable && onRemoveDocument ? (
                <button
                  type="button"
                  onClick={() => onRemoveDocument(index)}
                  className={`inline-flex h-5 w-5 items-center justify-center rounded ${
                    index === activeIndex ? 'hover:bg-violet-700' : 'hover:bg-slate-200'
                  }`}
                  title={t('i693.splitview_remove_document')}
                  aria-label={t('i693.splitview_remove_document')}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="relative min-h-[320px] flex-1 overflow-auto bg-slate-50 p-4">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/90">
            <LoadingSpinner message={t('i693.splitview_loading')} variant="light" />
          </div>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <div ref={hostRef} className="space-y-4" />
      </div>
    </aside>
  )
}
