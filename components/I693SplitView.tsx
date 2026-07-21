'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react'
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
const VIEWPORT_PADDING = 16

/** Discrete zoom steps: viewport-relative modes first, then absolute % of rendered content. */
type ViewMode = 'contain' | 'fit' | 50 | 75 | 100 | 125 | 150 | 175 | 200 | 250 | 300 | 400

const VIEW_MODES: ViewMode[] = [
  'contain',
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
]

type Size = { w: number; h: number }

function clampPanOffset(
  offset: Size,
  content: Size,
  scale: number,
  viewport: Size,
  padding: number
): Size {
  const scaledW = content.w * scale
  const scaledH = content.h * scale
  const availW = viewport.w - padding * 2
  const availH = viewport.h - padding * 2

  const minX = Math.min(0, availW - scaledW)
  const minY = Math.min(0, availH - scaledH)

  return {
    w: Math.min(0, Math.max(minX, offset.w)),
    h: Math.min(0, Math.max(minY, offset.h)),
  }
}

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
  const viewportRef = useRef<HTMLDivElement>(null)
  const renderTokenRef = useRef(0)
  const panStartRef = useRef<{ x: number; y: number; panW: number; panH: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('contain')
  const [userPan, setUserPan] = useState<Size>({ w: 0, h: 0 })
  const [contentSize, setContentSize] = useState<Size>({ w: 0, h: 0 })
  const [viewportSize, setViewportSize] = useState<Size>({ w: 0, h: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const hasSelection = activeIndex != null && activeIndex >= 0 && activeIndex < items.length
  const item = hasSelection ? items[activeIndex] ?? null : null

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
    setUserPan({ w: 0, h: 0 })
    panStartRef.current = null
    setIsPanning(false)
  }, [activeIndex, item?.key])

  useEffect(() => {
    setUserPan({ w: 0, h: 0 })
  }, [viewMode])

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

  const basePan = useMemo(() => {
    if (!contentSize.w || !viewportSize.w) {
      return { w: VIEWPORT_PADDING, h: VIEWPORT_PADDING }
    }

    const x =
      VIEWPORT_PADDING + Math.max(0, (availSize.w - scaledContent.w) / 2)
    const y =
      scaledContent.h <= availSize.h
        ? VIEWPORT_PADDING + Math.max(0, (availSize.h - scaledContent.h) / 2)
        : VIEWPORT_PADDING

    return { w: x, h: y }
  }, [
    availSize.h,
    availSize.w,
    contentSize.w,
    scaledContent.h,
    scaledContent.w,
    viewportSize.w,
  ])

  const clampedUserPan = useMemo(
    () =>
      canPan
        ? clampPanOffset(userPan, contentSize, displayScale, viewportSize, VIEWPORT_PADDING)
        : { w: 0, h: 0 },
    [canPan, contentSize, displayScale, userPan, viewportSize]
  )

  const displayPan = useMemo(
    () => ({
      w: basePan.w + clampedUserPan.w,
      h: basePan.h + clampedUserPan.h,
    }),
    [basePan.h, basePan.w, clampedUserPan.h, clampedUserPan.w]
  )

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
    if (!canPan || event.button !== 0) return
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panW: clampedUserPan.w,
      panH: clampedUserPan.h,
    }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleViewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current
    if (!start) return
    const next = {
      w: start.panW + (event.clientX - start.x),
      h: start.panH + (event.clientY - start.y),
    }
    setUserPan(clampPanOffset(next, contentSize, displayScale, viewportSize, VIEWPORT_PADDING))
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
    if (!canPan) return
    event.preventDefault()
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
          if (item.file) {
            const url = URL.createObjectURL(item.file)
            const img = document.createElement('img')
            img.src = url
            img.alt = item.name
            img.className =
              'mx-auto block h-auto max-w-full select-none bg-white shadow-sm border border-slate-200 pointer-events-none'
            img.onload = () => {
              URL.revokeObjectURL(url)
              measureSizes()
            }
            if (isStale()) return
            host.appendChild(img)
            measureSizes()
            return
          }
          if (item.url) {
            const img = document.createElement('img')
            img.src = item.url
            img.alt = item.name
            img.className =
              'mx-auto block h-auto max-w-full select-none bg-white shadow-sm border border-slate-200 pointer-events-none'
            img.onload = () => measureSizes()
            if (isStale()) return
            host.appendChild(img)
            measureSizes()
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
          wrapper.className =
            'mb-4 mx-auto w-fit rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden pointer-events-none select-none'
          const label = document.createElement('p')
          label.className = 'border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500'
          label.textContent = t('i693.splitview_page', { page: pageNum, total: pdf.numPages })
          wrapper.appendChild(label)
          wrapper.appendChild(canvas)
          host.appendChild(wrapper)

          await page.render({ canvasContext: context, viewport }).promise
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
  }, [activeIndex, hasSelection, item, items, measureSizes, t])

  const zoomIndex = VIEW_MODES.indexOf(viewMode)
  const canZoomOut = zoomIndex > 0
  const canZoomIn = zoomIndex >= 0 && zoomIndex < VIEW_MODES.length - 1

  const zoomOut = () => {
    if (canZoomOut) setViewMode(VIEW_MODES[zoomIndex - 1]!)
  }

  const zoomIn = () => {
    if (canZoomIn) setViewMode(VIEW_MODES[zoomIndex + 1]!)
  }

  const zoomLabel =
    viewMode === 'contain'
      ? t('i693.splitview_zoom_contain')
      : viewMode === 'fit'
        ? t('i693.splitview_zoom_fit')
        : `${viewMode}%`

  if (items.length === 0) return null

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
    <aside className="flex h-full min-h-[calc(100vh-10rem)] w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm lg:max-h-[calc(100vh-10rem)]">
      <div className="flex items-start justify-between gap-3 border-b border-violet-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-violet-900">{t('i693.splitview_title')}</h3>
          <p
            className="mt-0.5 truncate text-xs text-slate-500"
            title={hasSelection ? item?.name : undefined}
          >
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

      <div className="shrink-0 border-b border-violet-50 bg-slate-50">{documentList}</div>

      {hasSelection ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-violet-50 bg-white px-3 py-2">
            <p className="text-[11px] text-slate-500">
              {canPan ? t('i693.splitview_pan_hint') : t('i693.splitview_contain_hint')}
            </p>
            <div className="flex items-center gap-1">
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
              <span className="min-w-[4.5rem] rounded-lg border border-slate-200 px-2 py-1 text-center text-xs font-medium text-slate-700">
                {zoomLabel}
              </span>
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
            </div>
          </div>

          <div
            ref={viewportRef}
            className={`relative min-h-0 flex-1 touch-none overflow-hidden bg-slate-50 ${
              canPan ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
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
              className="inline-block w-max max-w-none"
              style={{
                transform: `translate(${displayPan.w}px, ${displayPan.h}px) scale(${displayScale})`,
                transformOrigin: '0 0',
              }}
            >
              <div ref={hostRef} className="space-y-4" />
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
          {t('i693.splitview_pick_hint')}
        </div>
      )}
    </aside>
  )
}
