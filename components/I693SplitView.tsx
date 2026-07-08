'use client'

import { useEffect, useRef, useState } from 'react'
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
  activeIndex: number | null
  onActiveIndexChange: (index: number | null) => void
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
  const renderTokenRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasSelection = activeIndex != null && activeIndex >= 0 && activeIndex < items.length
  const item = hasSelection ? items[activeIndex] ?? null : null

  useEffect(() => {
    const host = hostRef.current
    if (!host || !item || !hasSelection) return

    const renderToken = ++renderTokenRef.current
    const itemKey = item.key
    const isStale = () =>
      renderToken !== renderTokenRef.current || items[activeIndex]?.key !== itemKey

    setLoading(true)
    setError(null)
    host.innerHTML = ''

    void (async () => {
      try {
        if (isSplitViewImage(item)) {
          if (item.file) {
            const url = URL.createObjectURL(item.file)
            const img = document.createElement('img')
            img.src = url
            img.alt = item.name
            img.className = 'max-w-full h-auto mx-auto block bg-white shadow-sm border border-slate-200'
            img.onload = () => URL.revokeObjectURL(url)
            if (isStale()) return
            host.appendChild(img)
            return
          }
          if (item.url) {
            const img = document.createElement('img')
            img.src = item.url
            img.alt = item.name
            img.className = 'max-w-full h-auto mx-auto block bg-white shadow-sm border border-slate-200'
            if (isStale()) return
            host.appendChild(img)
            return
          }
        }

        if (!isSplitViewPdf(item)) {
          throw new Error(t('i693.splitview_unsupported'))
        }

        const bytes = clonePdfBytes(await readSplitViewBytes(item))
        if (isStale()) return

        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const pdf = await loadPdfJsDocument(pdfjs, bytes)
        if (isStale()) return

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (isStale()) return

          const page = await pdf.getPage(pageNum)
          if (isStale()) return

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
        if (!isStale()) {
          setError(e instanceof Error ? e.message : t('i693.splitview_load_failed'))
        }
      } finally {
        if (!isStale()) {
          setLoading(false)
        }
      }
    })()

    return () => {
      host.innerHTML = ''
    }
  }, [activeIndex, hasSelection, item, items, t])

  if (items.length === 0) return null

  const documentList = (
    <ul className="max-h-64 space-y-0.5 overflow-y-auto px-2 py-2">
      {items.map((doc, index) => {
        const active = hasSelection && index === activeIndex
        return (
          <li key={doc.key} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onActiveIndexChange(index)}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${
                active ? 'bg-violet-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
              title={doc.name}
              aria-current={active ? 'true' : undefined}
            >
              <svg
                className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
              </svg>
              <span className="truncate">{doc.name}</span>
            </button>
            {removable && onRemoveDocument ? (
              <button
                type="button"
                onClick={() => onRemoveDocument(index)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                title={t('i693.splitview_remove_document')}
                aria-label={t('i693.splitview_remove_document')}
              >
                ✕
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )

  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-violet-200 bg-white shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-10rem)] lg:self-start">
      <div className="flex items-start justify-between gap-3 border-b border-violet-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-violet-900">
            {hasSelection ? t('i693.splitview_title') : t('i693.splitview_pick_title')}
          </h3>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={item?.name}>
            {hasSelection ? item?.name : t('i693.splitview_pick_hint')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasSelection ? (
            <button
              type="button"
              onClick={() => onActiveIndexChange(null)}
              className="rounded-lg border border-violet-200 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50"
              title={t('i693.splitview_change_document')}
            >
              {t('i693.splitview_change_document')}
            </button>
          ) : null}
          {removable && onRemoveDocument && hasSelection ? (
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

      {!hasSelection ? (
        <div className="min-h-[320px] flex-1 overflow-auto bg-slate-50">
          <p className="border-b border-violet-50 px-4 py-2 text-xs text-slate-500">
            {t('i693.splitview_pick_hint')}
          </p>
          {documentList}
        </div>
      ) : (
        <>
          {items.length > 1 ? (
            <div className="border-b border-violet-50">{documentList}</div>
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
        </>
      )}
    </aside>
  )
}
