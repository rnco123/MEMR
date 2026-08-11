'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ChangeEvent,
  type WheelEvent,
} from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  type I693SplitViewItem,
  type I693SplitViewSource,
  isSplitViewImage,
  isSplitViewPdf,
  readSplitViewBytes,
} from '@/lib/i693/split-view-document'
import { clonePdfBytes, loadPdfJsDocument } from '@/lib/i693/pdfjs-load'
import { printImageBlob, printPdfBlob } from '@/lib/patient-documents/print-document'
import {
  CHART_PDF_VIEW_SCALE,
  renderPdfPageToCanvas,
} from '@/lib/patient-documents/pdf-canvas-render'
import { useT } from '@/lib/i18n'

const VIEWPORT_PADDING = 16

/** Discrete zoom steps: viewport-relative modes first, then absolute % of rendered content. */
type ViewMode =
  | 'contain'
  | 'fit'
  | 25
  | 33
  | 50
  | 75
  | 100
  | 125
  | 150
  | 175
  | 200
  | 250
  | 300
  | 400
  | 450
  | 500
  | 600
  | 800

const VIEW_MODES: ViewMode[] = [
  'contain',
  25,
  33,
  50,
  75,
  'fit',
  100,
  125,
  150,
  175,
  200,
  250,
  300,
  400,
  450,
  500,
  600,
  800,
]

function formatViewModeLabel(mode: ViewMode, t: (key: string) => string): string {
  if (mode === 'contain') return t('i693.splitview_zoom_contain')
  if (mode === 'fit') return t('i693.splitview_zoom_fit')
  return `${mode}%`
}

type Size = { w: number; h: number }


function renderImageToCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  rotationDegrees: number = 0
): { width: number; height: number } {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not acquire canvas 2D context')

  const normDeg = ((rotationDegrees % 360) + 360) % 360
  const rad = (normDeg * Math.PI) / 180
  const isSwapped = normDeg === 90 || normDeg === 270

  const width = isSwapped ? img.naturalHeight : img.naturalWidth
  const height = isSwapped ? img.naturalWidth : img.naturalHeight

  canvas.width = width
  canvas.height = height
  canvas.className =
    'mx-auto block h-auto max-w-full select-none rounded-lg border border-slate-200 bg-white shadow-sm pointer-events-none'

  ctx.save()
  if (normDeg === 90) {
    ctx.translate(width, 0)
    ctx.rotate(rad)
  } else if (normDeg === 180) {
    ctx.translate(width, height)
    ctx.rotate(rad)
  } else if (normDeg === 270) {
    ctx.translate(0, height)
    ctx.rotate(rad)
  }
  ctx.drawImage(img, 0, 0)
  ctx.restore()

  return { width, height }
}

type Props = {
  items: I693SplitViewItem[]
  activeIndex: number | null
  onActiveIndexChange: (index: number | null) => void
  onClosePanel: () => void
  onSaveDocument?: (index: number) => void
  onRemoveDocument?: (index: number) => void
  removable?: boolean
  source?: I693SplitViewSource
  onSourceChange?: (source: I693SplitViewSource) => void
  showSourceToggle?: boolean
  allowUpload?: boolean
  onFilesSelected?: (files: File[]) => void
  emptyHint?: string
}

export function I693SplitView({
  items,
  activeIndex,
  onActiveIndexChange,
  onClosePanel,
  onSaveDocument,
  onRemoveDocument,
  removable = false,
  source = 'supporting',
  onSourceChange,
  showSourceToggle = false,
  allowUpload = false,
  onFilesSelected,
  emptyHint,
}: Props) {
  const { t } = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const renderTokenRef = useRef(0)
  const panStartRef = useRef<{ x: number; y: number; panW: number; panH: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('contain')
  const [rotations, setRotations] = useState<Record<string, number>>({})
  const [contentSize, setContentSize] = useState<Size>({ w: 0, h: 0 })
  const [viewportSize, setViewportSize] = useState<Size>({ w: 0, h: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [listExpanded, setListExpanded] = useState(true)
  const hasSelection = activeIndex != null && activeIndex >= 0 && activeIndex < items.length
  const item = hasSelection ? items[activeIndex] ?? null : null
  const rotation = item ? rotations[item.key] ?? 0 : 0

  const rotateLeft = useCallback(() => {
    if (!item) return
    setRotations((prev) => {
      const current = prev[item.key] ?? 0
      const next = (current - 90 + 360) % 360
      return { ...prev, [item.key]: next }
    })
  }, [item])

  const rotateRight = useCallback(() => {
    if (!item) return
    setRotations((prev) => {
      const current = prev[item.key] ?? 0
      const next = (current + 90) % 360
      return { ...prev, [item.key]: next }
    })
  }, [item])

  const resetRotation = useCallback(() => {
    if (!item) return
    setRotations((prev) => {
      const copy = { ...prev }
      delete copy[item.key]
      return copy
    })
  }, [item])

  // Collapse the document list whenever a file opens; reopen it when the
  // selection is cleared. Re-runs on activeIndex so switching files re-collapses.
  useEffect(() => {
    setListExpanded(!hasSelection)
  }, [activeIndex, hasSelection])

  const measureSizes = useCallback(() => {
    const host = hostRef.current
    const viewport = viewportRef.current
    if (host) {
      setContentSize({ w: host.scrollWidth, h: host.scrollHeight })
    }
    if (viewport) {
      setViewportSize({ w: viewport.clientWidth, h: viewport.clientHeight })
    }
  }, [])

  useEffect(() => {
    setViewMode('contain')
    panStartRef.current = null
    setIsPanning(false)
  }, [activeIndex, item?.key])



  const availSize = useMemo(
    () => ({
      w: Math.max(0, viewportSize.w - VIEWPORT_PADDING * 2),
      h: Math.max(0, viewportSize.h - VIEWPORT_PADDING * 2),
    }),
    [viewportSize.h, viewportSize.w]
  )

  const containScale = useMemo(() => {
    if (!contentSize.w || !contentSize.h || !availSize.w || !availSize.h) return 1
    return Math.min(availSize.w / contentSize.w, availSize.h / contentSize.h)
  }, [availSize.h, availSize.w, contentSize.h, contentSize.w])

  const fitScale = useMemo(() => {
    if (!contentSize.w || !availSize.w) return containScale
    return availSize.w / contentSize.w
  }, [availSize.w, containScale, contentSize.w])

  const displayScale = useMemo(() => {
    if (viewMode === 'contain') return containScale
    if (viewMode === 'fit') return fitScale
    return viewMode / 100
  }, [containScale, fitScale, viewMode])

  const scaledContent = useMemo(
    () => ({
      w: contentSize.w * displayScale,
      h: contentSize.h * displayScale,
    }),
    [contentSize.h, contentSize.w, displayScale]
  )

  const canPan = useMemo(() => {
    if (viewMode === 'contain' || !contentSize.w) return false
    return scaledContent.h > availSize.h + 1 || scaledContent.w > availSize.w + 1
  }, [availSize.h, availSize.w, contentSize.w, scaledContent.h, scaledContent.w, viewMode])



  useEffect(() => {
    const host = hostRef.current
    const viewport = viewportRef.current
    if (!host && !viewport) return

    const observer = new ResizeObserver(() => {
      measureSizes()
    })

    if (host) observer.observe(host)
    if (viewport) observer.observe(viewport)
    measureSizes()

    return () => observer.disconnect()
  }, [loading, hasSelection, measureSizes])

  const handleViewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canPan || event.button !== 0 || !showCanvasHand) return
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panW: viewportRef.current?.scrollLeft ?? 0,
      panH: viewportRef.current?.scrollTop ?? 0,
    }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleViewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current
    if (!start || !viewportRef.current) return
    
    // Reverse direction: dragging down scrolls up
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    
    viewportRef.current.scrollLeft = start.panW - deltaX
    viewportRef.current.scrollTop = start.panH - deltaY
  }

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (panStartRef.current) {
      panStartRef.current = null
      setIsPanning(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }
  }

  const handleViewportWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      if (canPan) event.preventDefault()
      return
    }
    event.preventDefault()
    const idx = VIEW_MODES.indexOf(viewMode)
    if (idx < 0) return
    if (event.deltaY < 0 && idx < VIEW_MODES.length - 1) {
      setViewMode(VIEW_MODES[idx + 1]!)
    } else if (event.deltaY > 0 && idx > 0) {
      setViewMode(VIEW_MODES[idx - 1]!)
    }
  }

  const resetZoom = () => setViewMode('contain')

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0 || !onFilesSelected) return
    onFilesSelected(files)
  }

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
          const imgSrc = item.file ? URL.createObjectURL(item.file) : item.url
          if (imgSrc) {
            const img = new Image()
            img.alt = item.name
            img.onload = () => {
              if (item.file) URL.revokeObjectURL(imgSrc)
              if (isStale()) return
              const canvas = document.createElement('canvas')
              renderImageToCanvas(img, canvas, rotation)
              host.appendChild(canvas)
              measureSizes()
              setLoading(false)
            }
            img.onerror = () => {
              if (item.file) URL.revokeObjectURL(imgSrc)
              if (!isStale()) {
                setError(t('i693.splitview_load_failed'))
                setLoading(false)
              }
            }
            img.src = imgSrc
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

          const canvas = document.createElement('canvas')
          canvas.className = 'block'

          const wrapper = document.createElement('div')
          wrapper.className =
            'mb-4 mx-auto w-fit rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden pointer-events-none select-none'
          const label = document.createElement('p')
          label.className = 'border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500'
          label.textContent = t('i693.splitview_page', { page: pageNum, total: pdf.numPages })
          wrapper.appendChild(label)
          wrapper.appendChild(canvas)
          host.appendChild(wrapper)

          await renderPdfPageToCanvas(page, canvas, CHART_PDF_VIEW_SCALE, rotation)
        }

        measureSizes()
      } catch (e) {
        if (!isStale()) {
          setError(e instanceof Error ? e.message : t('i693.splitview_load_failed'))
        }
      } finally {
        if (!isStale()) {
          setLoading(false)
          measureSizes()
        }
      }
    })()

    return () => {
      host.innerHTML = ''
    }
  }, [activeIndex, hasSelection, item, items, measureSizes, rotation, t])

  const zoomIndex = VIEW_MODES.indexOf(viewMode)
  const canZoomOut = zoomIndex > 0
  const canZoomIn = zoomIndex >= 0 && zoomIndex < VIEW_MODES.length - 1

  const zoomOut = () => {
    if (canZoomOut) setViewMode(VIEW_MODES[zoomIndex - 1]!)
  }

  const zoomIn = () => {
    if (canZoomIn) setViewMode(VIEW_MODES[zoomIndex + 1]!)
  }

  const pickHint = emptyHint ?? t('i693.splitview_pick_hint')
  const showCanvasHand = hasSelection && !loading

  const printDocument = async (doc: I693SplitViewItem) => {
    // Open while the click still has user activation — popup blockers eat windows opened after an await.
    const printWindow = window.open('', '_blank')
    try {
      const bytes = await readSplitViewBytes(doc)
      const name = doc.name || 'document'
      if (isSplitViewPdf(doc)) {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
        if (!printPdfBlob(blob, name, printWindow)) {
          toast.error(t('i693.splitview_print_failed'))
        }
        return
      }
      if (isSplitViewImage(doc)) {
        const blob = new Blob([new Uint8Array(bytes)], {
          type: doc.mimeType || doc.file?.type || '',
        })
        if (!printImageBlob(blob, name, printWindow)) {
          toast.error(t('i693.splitview_print_failed'))
        }
        return
      }
      printWindow?.close()
      toast.error(t('i693.splitview_unsupported'))
    } catch (err) {
      if (printWindow && !printWindow.closed) printWindow.close()
      console.error('Print failed:', err)
      toast.error(err instanceof Error ? err.message : t('i693.splitview_print_failed'))
    }
  }

  if (items.length === 0 && !allowUpload && !showSourceToggle) return null

  const documentList = (
    <ul className="max-h-40 space-y-0.5 overflow-y-auto px-2 py-2">
      {items.map((doc, index) => {
        const active = hasSelection && index === activeIndex
        return (
          <li key={doc.key} className="flex w-full items-center gap-1">
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
            <button
              type="button"
              onClick={() => printDocument(doc)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              title={t('i693.splitview_print_document')}
              aria-label={t('i693.splitview_print_document')}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1M8 14h8v7H8v-7z" />
              </svg>
            </button>
            {doc.file && !doc.saved && onSaveDocument ? (
              <button
                type="button"
                onClick={() => onSaveDocument(index)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                title={t('i693.splitview_save_document')}
                aria-label={t('i693.splitview_save_document')}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
              </button>
            ) : null}
            {removable && onRemoveDocument ? (
              <button
                type="button"
                onClick={() => onRemoveDocument(index)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
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
    <aside className="flex h-full min-h-[calc(100vh-10rem)] w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm lg:max-h-[calc(100vh-10rem)]">
      <div className="flex items-center justify-between gap-3 border-b border-violet-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h3 className="text-sm font-semibold text-violet-900 shrink-0">{t('i693.splitview_title')}</h3>
          {showSourceToggle && onSourceChange ? (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => onSourceChange('supporting')}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  source === 'supporting'
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('i693.splitview_source_supporting')}
              </button>
              <button
                type="button"
                onClick={() => onSourceChange('patient_chart')}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  source === 'patient_chart'
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('i693.splitview_source_patient_chart')}
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClosePanel}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          title={t('i693.splitview_close')}
          aria-label={t('i693.splitview_close')}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {(allowUpload && onFilesSelected) || items.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-violet-50 bg-slate-50 px-3 py-1.5">
          {allowUpload && onFilesSelected ? (
            <>
              <input
                ref={uploadInputRef}
                type="file"
                accept=".pdf,image/*"
                multiple
                className="hidden"
                onChange={handleUploadChange}
              />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2 text-[11px] font-medium text-violet-700 shadow-sm hover:bg-violet-50 transition-colors"
                title={t('i693.splitview_upload_hint')}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t('i693.splitview_upload')}
              </button>
              {items.length > 0 ? (
                <span className="h-4 w-px bg-slate-200" aria-hidden />
              ) : null}
            </>
          ) : null}
          
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => setListExpanded((prev) => !prev)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              aria-expanded={listExpanded}
              title={hasSelection ? item?.name : pickHint}
            >
              <span className="truncate">
                {hasSelection ? item?.name : (listExpanded ? t('i693.splitview_hide_documents') : t('i693.splitview_show_documents', { count: items.length }))}
              </span>
              <svg
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${listExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ) : (
            <p className="text-[11px] text-slate-500 truncate">{t('i693.splitview_empty_hint')}</p>
          )}
        </div>
      ) : null}

      {items.length > 0 && (!hasSelection || listExpanded) ? (
        <div className="shrink-0 border-b border-violet-50 bg-slate-50/50">
          {documentList}
        </div>
      ) : null}

      {hasSelection ? (
        <>
          <div className="flex shrink-0 items-center justify-end gap-2 border-b border-violet-50 bg-white px-3 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => item && printDocument(item)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                title={t('i693.splitview_print_document')}
                aria-label={t('i693.splitview_print_document')}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1M8 14h8v7H8v-7z" />
                </svg>
              </button>
              {item?.file && !item?.saved && onSaveDocument && activeIndex !== null ? (
                <button
                  type="button"
                  onClick={() => onSaveDocument(activeIndex)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50"
                  title={t('i693.splitview_save_document')}
                  aria-label={t('i693.splitview_save_document')}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                </button>
              ) : null}
              {removable && onRemoveDocument ? (
                <button
                  type="button"
                  onClick={() => onRemoveDocument(activeIndex)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  title={t('i693.splitview_remove_document')}
                  aria-label={t('i693.splitview_remove_document')}
                >
                  ✕
                </button>
              ) : null}
              <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />
              <button
                type="button"
                onClick={rotateLeft}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                title={t('i693.splitview_rotate_left')}
                aria-label={t('i693.splitview_rotate_left')}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={rotateRight}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                title={t('i693.splitview_rotate_right')}
                aria-label={t('i693.splitview_rotate_right')}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={resetRotation}
                disabled={rotation === 0}
                className={`inline-flex h-7 min-w-[32px] items-center justify-center rounded-lg border px-1.5 text-[11px] font-semibold transition-colors ${
                  rotation === 0
                    ? 'border-slate-200 bg-white text-slate-400'
                    : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                }`}
                title={t('i693.splitview_rotate_reset')}
                aria-label={t('i693.splitview_rotate_reset')}
              >
                {rotation}°
              </button>
              <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />
              <button
                type="button"
                onClick={zoomOut}
                disabled={!canZoomOut}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title={t('i693.splitview_zoom_out')}
                aria-label={t('i693.splitview_zoom_out')}
              >
                −
              </button>
              <select
                value={String(viewMode)}
                onChange={(event) => {
                  const raw = event.target.value
                  if (raw === 'contain' || raw === 'fit') {
                    setViewMode(raw)
                  } else {
                    const pct = Number(raw)
                    if (VIEW_MODES.includes(pct as ViewMode)) setViewMode(pct as ViewMode)
                  }
                }}
                className="h-7 min-w-[5.5rem] max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-700"
                title={t('i693.splitview_zoom_level')}
                aria-label={t('i693.splitview_zoom_level')}
              >
                {VIEW_MODES.map((mode) => (
                  <option key={String(mode)} value={String(mode)}>
                    {formatViewModeLabel(mode, t)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={zoomIn}
                disabled={!canZoomIn}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title={t('i693.splitview_zoom_in')}
                aria-label={t('i693.splitview_zoom_in')}
              >
                +
              </button>
              <button
                type="button"
                onClick={resetZoom}
                disabled={viewMode === 'contain'}
                className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                title={t('i693.splitview_zoom_reset')}
                aria-label={t('i693.splitview_zoom_reset')}
              >
                {t('i693.splitview_zoom_reset')}
              </button>
            </div>
          </div>

          <div
            ref={viewportRef}
            className={`relative min-h-0 flex-1 flex flex-col touch-none overflow-auto bg-slate-50 ${
              showCanvasHand ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
            }`}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onWheel={handleViewportWheel}
          >
            {loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/90">
                <LoadingSpinner message={t('i693.splitview_loading')} variant="light" />
              </div>
            ) : null}
            {error ? (
              <p className="absolute left-4 right-4 top-4 z-10 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div
              style={{
                width: `${scaledContent.w + VIEWPORT_PADDING * 2}px`,
                height: `${scaledContent.h + VIEWPORT_PADDING * 2}px`,
                padding: `${VIEWPORT_PADDING}px`,
                margin: 'auto',
              }}
              className="shrink-0"
            >
              <div
                style={{
                  transform: `scale(${displayScale})`,
                  transformOrigin: '0 0',
                  width: `${contentSize.w}px`,
                  height: `${contentSize.h}px`,
                }}
              >
                <div ref={hostRef} className="space-y-4 inline-block w-max max-w-none" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
          {pickHint}
        </div>
      )}
    </aside>
  )
}
