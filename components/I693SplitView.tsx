'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { clonePdfBytes, loadPdfJsDocument } from '@/lib/i693/pdfjs-load'
import { useT } from '@/lib/i18n'

const SPLIT_VIEW_SCALE = 1.05

type Props = {
  files: File[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onClosePanel: () => void
  onRemoveDocument: (index: number) => void
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

export function I693SplitView({
  files,
  activeIndex,
  onActiveIndexChange,
  onClosePanel,
  onRemoveDocument,
}: Props) {
  const { t } = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = files[activeIndex] ?? null

  const renderDocument = useCallback(async () => {
    const host = hostRef.current
    if (!host || !file) return

    setLoading(true)
    setError(null)
    host.innerHTML = ''

    try {
      if (isImageFile(file)) {
        const url = URL.createObjectURL(file)
        const img = document.createElement('img')
        img.src = url
        img.alt = file.name
        img.className = 'max-w-full h-auto mx-auto block bg-white shadow-sm border border-slate-200'
        img.onload = () => URL.revokeObjectURL(url)
        host.appendChild(img)
        return
      }

      if (!isPdfFile(file)) {
        throw new Error(t('i693.splitview_unsupported'))
      }

      const bytes = clonePdfBytes(new Uint8Array(await file.arrayBuffer()))
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
  }, [file, t])

  useEffect(() => {
    void renderDocument()
  }, [renderDocument])

  if (files.length === 0 || !file) return null

  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-violet-200 bg-white shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-10rem)] lg:self-start">
      <div className="flex items-start justify-between gap-3 border-b border-violet-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-violet-900">{t('i693.splitview_title')}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={file.name}>
            {file.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRemoveDocument(activeIndex)}
            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            title={t('i693.splitview_remove_document')}
          >
            {t('i693.splitview_remove_document')}
          </button>
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

      {files.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-b border-violet-50 px-4 py-2">
          {files.map((item, index) => (
            <div
              key={`${item.name}-${item.size}-${index}`}
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
                title={item.name}
              >
                {item.name}
              </button>
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
