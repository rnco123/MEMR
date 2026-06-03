'use client'

import 'pdfjs-dist/web/pdf_viewer.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { I693PdfCharCellField } from '@/components/I693PdfCharCellField'
import type { I693FormData } from '@/lib/i693/types'
import {
  applyI693FormToPdfDocument,
} from '@/lib/i693/pdfjs-form-bridge'
import { clonePdfBytes, loadPdfJsDocument } from '@/lib/i693/pdfjs-load'
import {
  discoverCombPlacementsFromLayer,
  type I693DomCombPlacement,
} from '@/lib/i693/pdf-comb-fields'
import { getNestedValue } from '@/lib/i693/field-sections'
import type { I693AiDraftEvidence } from '@/lib/i693/supporting-documents/schema'

const PDF_URL = '/forms/i-693-template.pdf'
const DRAFT_SCALE = 0.8

type PageHost = {
  page: number
  pageBoxEl: HTMLDivElement
}

export type I693SupportingDocumentDraft = {
  form_data: I693FormData
  evidence: I693AiDraftEvidence[]
  warnings: string[]
  filled_fields: string[]
  filled_count: number
  model: string
  documents: Array<{
    file_name: string
    pages: number
    line_count: number
    average_confidence: number | null
  }>
}

type Props = {
  draft: I693SupportingDocumentDraft
  onAccept: () => void
  onReject: () => void
}

class PdfLinkService {
  pagesCount: number
  page = 1
  rotation = 0
  externalLinkEnabled = true
  constructor(pagesCount: number) {
    this.pagesCount = pagesCount
  }
  getDestinationHash() {
    return ''
  }
  getAnchorUrl() {
    return ''
  }
  setHash() {}
  executeNamedAction() {}
  executeSetOCGState() {}
  onPageShow() {}
  cachePageRef() {}
  isPageVisible() {
    return true
  }
  isPageCached() {
    return true
  }
  isInPresentationMode = false
  goToDestination() {}
  goToPage(page: number) {
    this.page = page
  }
  addLinkAttributes() {}
}

function lockFormLayer(root: HTMLElement): void {
  root.style.pointerEvents = 'none'
  root.querySelectorAll('input, textarea, select, button').forEach((node) => {
    const el = node as HTMLInputElement
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.disabled = true
    } else {
      el.readOnly = true
    }
    el.tabIndex = -1
    el.style.pointerEvents = 'none'
    el.style.cursor = 'default'
  })
}

export function I693AiDraftPdfReview({ draft, onAccept, onReject }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageHosts, setPageHosts] = useState<PageHost[]>([])
  const [combPlacements, setCombPlacements] = useState<I693DomCombPlacement[]>([])

  const renderDraft = useCallback(async () => {
    const host = hostRef.current
    if (!host) return
    setLoading(true)
    setError(null)

    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

      const templateBytes = await fetch(PDF_URL).then((r) => r.arrayBuffer())
      const pdf = await loadPdfJsDocument(pdfjs, clonePdfBytes(new Uint8Array(templateBytes)))
      await applyI693FormToPdfDocument(pdf, draft.form_data)

      host.innerHTML = ''
      const linkService = new PdfLinkService(pdf.numPages)
      const nextPageHosts: PageHost[] = []
      const nextCombPlacements: I693DomCombPlacement[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: DRAFT_SCALE })

        const wrap = document.createElement('div')
        wrap.className = 'flex flex-col items-center gap-2 w-full mb-6'
        const label = document.createElement('p')
        label.className = 'text-xs font-medium text-slate-500 self-start'
        label.textContent = `AI draft page ${pageNum} / ${pdf.numPages}`
        wrap.appendChild(label)

        const pageBox = document.createElement('div')
        pageBox.className = 'relative shadow-md bg-white ring-1 ring-emerald-200/90'
        pageBox.style.width = `${viewport.width}px`
        pageBox.style.height = `${viewport.height}px`

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.className = 'block'
        const ctx = canvas.getContext('2d')
        if (!ctx) continue

        const formLayerDiv = document.createElement('div')
        formLayerDiv.className = 'annotationLayer absolute inset-0'

        pageBox.appendChild(canvas)
        pageBox.appendChild(formLayerDiv)
        wrap.appendChild(pageBox)
        host.appendChild(wrap)

        await page.render({
          canvasContext: ctx,
          viewport,
          annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
        }).promise

        const annotationsList = await page.getAnnotations()
        const layer = new pdfjs.AnnotationLayer({
          div: formLayerDiv,
          page,
          viewport,
          accessibilityManager: null,
          annotationCanvasMap: null,
          annotationEditorUIManager: null,
          structTreeLayer: null,
        })
        await layer.render({
          viewport,
          div: formLayerDiv,
          page,
          annotations: annotationsList,
          linkService: linkService as any,
          renderForms: true,
          annotationStorage: pdf.annotationStorage,
        })

        lockFormLayer(formLayerDiv)
        nextCombPlacements.push(...discoverCombPlacementsFromLayer(formLayerDiv, pageBox, pageNum))
        nextPageHosts.push({ page: pageNum, pageBoxEl: pageBox })
      }

      setCombPlacements(nextCombPlacements)
      setPageHosts(nextPageHosts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI draft PDF failed to load')
    } finally {
      setLoading(false)
    }
  }, [draft.form_data])

  useEffect(() => {
    void renderDraft()
    return () => {
      if (hostRef.current) hostRef.current.innerHTML = ''
      setPageHosts([])
      setCombPlacements([])
    }
  }, [renderDraft])

  const charCellPortals = useMemo(() => {
    if (combPlacements.length === 0) return null

    return pageHosts.flatMap((pageHost) => {
      const fieldsOnPage = combPlacements.filter((field) => field.page === pageHost.page)

      return fieldsOnPage.map((field) => {
        const raw = getNestedValue(draft.form_data as unknown as Record<string, unknown>, field.key)
        const value = raw == null ? '' : String(raw)

        return createPortal(
          <I693PdfCharCellField
            placement={{
              key: field.key,
              page: pageHost.page,
              x: field.leftPx,
              y: field.topPx,
              count: field.count,
              cellWidth: field.cellWidthPx,
              height: field.heightPx,
              mode: field.mode,
              label: field.label,
            }}
            value={value}
            pixelCoords
            editScale={1}
            readOnly
            onChange={() => {}}
          />,
          pageHost.pageBoxEl,
          `ai-draft-comb-${field.widgetName}`
        )
      })
    })
  }, [combPlacements, draft.form_data, pageHosts])

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/70 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-200 bg-white px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">AI generated I-693 review editor</h3>
          <p className="mt-1 text-xs text-slate-500">
            {draft.filled_count} fields from {draft.documents.length} PDF
            {draft.documents.length === 1 ? '' : 's'} using {draft.model}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReject}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Accept into default editor
          </button>
        </div>
      </div>

      {(draft.warnings.length > 0 || draft.evidence.length > 0) && (
        <div className="grid gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3 md:grid-cols-2">
          {draft.warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Warnings</p>
              <ul className="mt-1 space-y-1 text-xs text-amber-800">
                {draft.warnings.slice(0, 6).map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          {draft.evidence.length > 0 && (
            <details className="text-xs text-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-800">
                Evidence ({draft.evidence.length})
              </summary>
              <div className="mt-2 max-h-36 space-y-2 overflow-auto pr-2">
                {draft.evidence.slice(0, 40).map((item, index) => (
                  <div key={`${item.field}-${index}`} className="rounded-md border border-emerald-100 bg-white p-2">
                    <p className="font-medium text-slate-800">{item.field}</p>
                    <p className="text-slate-500">{item.source_document}</p>
                    <p className="mt-1 text-slate-600">{item.source_quote}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="relative max-h-[60vh] overflow-auto bg-slate-100 p-4">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
            <LoadingSpinner message="Rendering AI draft…" variant="light" />
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}
        <div ref={hostRef} className="i693-ai-draft-pdf min-h-[360px]" />
        {charCellPortals}
      </div>
    </div>
  )
}
