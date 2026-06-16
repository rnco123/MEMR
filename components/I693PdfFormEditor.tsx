'use client'

import 'pdfjs-dist/web/pdf_viewer.css'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Rnd } from 'react-rnd'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { I693FormData } from '@/lib/i693/types'
import { EMPTY_I693_FORM } from '@/lib/i693/types'
import { extractFormDataFromApi, parseFormDataFromApi } from '@/lib/i693/form-api'
import { I693PdfCharCellField } from '@/components/I693PdfCharCellField'
import {
  I693AiDraftPdfReview,
  type I693SupportingDocumentDraft,
} from '@/components/I693AiDraftPdfReview'
import { I693SplitView } from '@/components/I693SplitView'
import {
  applyI693FormToPdfDocument,
  extractI693FormFromPdfDocument,
} from '@/lib/i693/pdfjs-form-bridge'
import { formatI693WidgetValue } from '@/lib/i693/pdf-field-formatters'
import {
  discoverCombPlacementsFromLayer,
  setCombFieldOnPdfDocument,
  type I693DomCombPlacement,
} from '@/lib/i693/pdf-comb-fields'
import { getNestedValue, setNestedValue } from '@/lib/i693/field-sections'
import { clonePdfBytes, loadPdfJsDocument } from '@/lib/i693/pdfjs-load'
import { mergeAcceptedI693AiDraft } from '@/lib/i693/supporting-documents/merge-draft'
import {
  type I693Annotation,
  type I693CrossAnnotation,
  type I693ImageAnnotation,
  type I693TextAnnotation,
  parseI693Annotations,
  resolveStoredI693Annotations,
} from '@/lib/i693/annotations'
import { useT } from '@/lib/i18n'

const PDF_URL = '/forms/i-693-template.pdf'
const DEFAULT_SCALE = 1.2
const MIN_SCALE = 0.75
const MAX_SCALE = 2
const ANNOTATION_TEXT_SIZE = 12

type Props = {
  encounterId: number
  patientName?: string
}

type ViewMode = 'editor' | 'preview'
type AnnotationTool = 'none' | 'text' | 'cross' | 'image'

type PageAnnotationHost = {
  page: number
  width: number
  height: number
  hostEl: HTMLDivElement
  pageBoxEl: HTMLDivElement
}

/** Minimal link service for pdf.js annotation layers. */
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

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toPercent(valuePx: number, totalPx: number): number {
  if (!totalPx) return 0
  return Math.max(0, Math.min(1, valuePx / totalPx))
}

function toPx(percent: number, totalPx: number): number {
  return Math.max(0, percent) * totalPx
}

/** Prevent pdf.js AcroForm widgets from accepting edits in preview. */
function lockPreviewFormLayer(root: HTMLElement): void {
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

function addPreviewInteractionShield(formWrap: HTMLDivElement): void {
  const shield = document.createElement('div')
  shield.className = 'absolute inset-0 z-[20] cursor-default'
  shield.setAttribute('aria-hidden', 'true')
  shield.style.pointerEvents = 'auto'
  formWrap.appendChild(shield)
}

function isTextFormWidget(node: EventTarget | Element | null): node is HTMLInputElement | HTMLTextAreaElement {
  if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return false
  if (node instanceof HTMLTextAreaElement) return true
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden'].includes(node.type)
}

function fitPdfFormWidgetFont(el: HTMLInputElement | HTMLTextAreaElement): void {
  const width = el.clientWidth || el.getBoundingClientRect().width
  const height = el.clientHeight || el.getBoundingClientRect().height
  if (!width || !height) return

  const valueLength = Math.max((el.value || el.placeholder || '').length, 1)
  const baseFontSize = Math.max(6, Math.min(10, height * 0.72))
  const fittedFontSize = Math.max(5, Math.min(baseFontSize, (width - 4) / (valueLength * 0.54)))
  const lineHeight = Math.min(height, Math.max(fittedFontSize * 1.15, fittedFontSize + 1))

  el.style.boxSizing = 'border-box'
  el.style.fontSize = `${fittedFontSize}px`
  el.style.lineHeight = `${lineHeight}px`
  el.style.padding = '0 1px'
  el.style.overflow = 'hidden'
  el.style.textOverflow = 'clip'
  el.style.whiteSpace = el instanceof HTMLTextAreaElement ? 'pre-wrap' : 'nowrap'
}

function fitPdfFormLayerFonts(root: HTMLElement): void {
  root.querySelectorAll('input, textarea').forEach((node) => {
    if (isTextFormWidget(node)) fitPdfFormWidgetFont(node)
  })
}

function fittedAnnotationFontSize(value: string, width: number, height: number): number {
  const valueLength = Math.max((value || '').length, 1)
  const baseFontSize = Math.max(6, Math.min(ANNOTATION_TEXT_SIZE, height * 0.72))
  return Math.max(5, Math.min(baseFontSize, (width - 6) / (valueLength * 0.54)))
}

export function I693PdfFormEditor({ encounterId, patientName }: Props) {
  const { t } = useT()
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ViewMode>('editor')
  const [pdfReady, setPdfReady] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scale, setScale] = useState(DEFAULT_SCALE)
  const [dirty, setDirty] = useState(false)
  const [editorTick, setEditorTick] = useState(0)
  const [previewTick, setPreviewTick] = useState(0)
  const [tool, setTool] = useState<AnnotationTool>('none')
  const [form, setForm] = useState<I693FormData>(EMPTY_I693_FORM)
  const [annotations, setAnnotations] = useState<I693Annotation[]>([])
  const [pageHosts, setPageHosts] = useState<PageAnnotationHost[]>([])
  const [previewPageHosts, setPreviewPageHosts] = useState<PageAnnotationHost[]>([])
  const [previewCombPlacements, setPreviewCombPlacements] = useState<I693DomCombPlacement[]>([])
  const [combPlacements, setCombPlacements] = useState<I693DomCombPlacement[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [supportingFiles, setSupportingFiles] = useState<File[]>([])
  const [splitViewOpen, setSplitViewOpen] = useState(false)
  const [splitDocIndex, setSplitDocIndex] = useState(0)
  const [supportingLoading, setSupportingLoading] = useState(false)
  const [aiDraft, setAiDraft] = useState<I693SupportingDocumentDraft | null>(null)
  const editorHostRef = useRef<HTMLDivElement>(null)
  const previewHostRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const supportingInputRef = useRef<HTMLInputElement>(null)
  const pendingImageUrlRef = useRef<string | null>(null)
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null)
  const formRef = useRef(form)
  const annotationsRef = useRef(annotations)
  const bytesRef = useRef<Uint8Array | null>(null)
  formRef.current = form
  annotationsRef.current = annotations

  const commitAnnotations = useCallback(
    (next: I693Annotation[] | ((prev: I693Annotation[]) => I693Annotation[])) => {
      setAnnotations((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        annotationsRef.current = resolved
        return resolved
      })
    },
    []
  )

  const fetchFilledPdfBytes = useCallback(async (forPreview = true): Promise<Uint8Array> => {
    const qs = forPreview ? '?preview=1' : ''
    const res = await fetch(`/api/encounters/${encounterId}/i693/pdf${qs}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || json.message || `PDF export failed (${res.status})`)
    }
    return clonePdfBytes(new Uint8Array(await res.arrayBuffer()))
  }, [encounterId])

  const loadFormAndAnnotations = useCallback(async () => {
    const res = await fetch(`/api/encounters/${encounterId}/i693`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load I-693')
    const raw =
      extractFormDataFromApi(json) ??
      (json.submission ? extractFormDataFromApi(json.submission) : null) ??
      json.form_data
    const parsed = parseFormDataFromApi(raw)
    setForm(parsed)
    formRef.current = parsed
    const loadedAnnotations = resolveStoredI693Annotations(
      json.annotations ?? json.submission?.annotations,
      parsed
    )
    commitAnnotations(loadedAnnotations)
    setDirty(false)
  }, [commitAnnotations, encounterId])

  const updateCombField = useCallback(async (key: string, value: string) => {
    const formatted = formatI693WidgetValue(key, value)
    const next = structuredClone(formRef.current) as I693FormData
    setNestedValue(next as unknown as Record<string, unknown>, key, formatted)
    setForm(next)
    formRef.current = next
    setDirty(true)
    if (pdfRef.current) {
      await setCombFieldOnPdfDocument(pdfRef.current, key, formatted)
    }
  }, [])

  const syncFormFromPdf = useCallback(async () => {
    const pdf = pdfRef.current
    if (!pdf) return
    const next = await extractI693FormFromPdfDocument(pdf, formRef.current)
    setForm(next)
    formRef.current = next
    setDirty(true)
  }, [])

  const saveCurrent = useCallback(
    async (showToast: boolean): Promise<boolean> => {
      if (pdfRef.current) {
        const next = await extractI693FormFromPdfDocument(pdfRef.current, formRef.current)
        setForm(next)
        formRef.current = next
      }

      setSaving(true)
      try {
        const res = await fetch(`/api/encounters/${encounterId}/i693`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form_data: formRef.current,
            annotations: annotationsRef.current,
            status: 'draft',
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Save failed')
        if (
          annotationsRef.current.length > 0 &&
          json.annotations_persisted === false
        ) {
          toast.warning(
            'Overlays saved in form data only. Apply migration 060_i693_annotations.sql for dedicated annotation storage.'
          )
        }
        setDirty(false)
        if (showToast) toast.success(t('i693.saved'))
        return true
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Save failed')
        return false
      } finally {
        setSaving(false)
      }
    },
    [encounterId, t]
  )

  const renderEditorPdf = useCallback(
    async (data: I693FormData) => {
      const host = editorHostRef.current
      if (!host) return
      setPdfReady(false)

      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

      const templateBytes = await fetch(PDF_URL).then((r) => r.arrayBuffer())
      const pdf = await loadPdfJsDocument(pdfjs, new Uint8Array(templateBytes))
      pdfRef.current = pdf
      await applyI693FormToPdfDocument(pdf, data)

      host.innerHTML = ''
      const linkService = new PdfLinkService(pdf.numPages)
      const nextPageHosts: PageAnnotationHost[] = []
      const nextCombPlacements: I693DomCombPlacement[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: DEFAULT_SCALE })

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

        const formLayerDiv = document.createElement('div')
        formLayerDiv.className = 'annotationLayer absolute inset-0'

        const annHostDiv = document.createElement('div')
        annHostDiv.className = 'absolute inset-0 z-20'
        annHostDiv.style.pointerEvents = 'none'

        pageBox.appendChild(canvas)
        pageBox.appendChild(formLayerDiv)
        pageBox.appendChild(annHostDiv)
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
        fitPdfFormLayerFonts(formLayerDiv)
        const handleFormLayerEdit = (event: Event) => {
          if (isTextFormWidget(event.target)) fitPdfFormWidgetFont(event.target)
          void syncFormFromPdf()
        }
        formLayerDiv.addEventListener('change', handleFormLayerEdit)
        formLayerDiv.addEventListener('input', handleFormLayerEdit)

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        nextCombPlacements.push(
          ...discoverCombPlacementsFromLayer(formLayerDiv, pageBox, pageNum)
        )

        nextPageHosts.push({
          page: pageNum,
          width: viewport.width,
          height: viewport.height,
          hostEl: annHostDiv,
          pageBoxEl: pageBox,
        })
      }

      setCombPlacements(nextCombPlacements)
      setPageHosts(nextPageHosts)
      setPdfReady(true)
    },
    [syncFormFromPdf, t]
  )

  const renderPreviewPdf = useCallback(
    async (bytes: Uint8Array, nextScale: number) => {
      const host = previewHostRef.current
      if (!host) return

      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const pdf = await loadPdfJsDocument(pdfjs, bytes)
      host.innerHTML = ''
      const linkService = new PdfLinkService(pdf.numPages)
      const nextPreviewPageHosts: PageAnnotationHost[] = []
      const nextPreviewCombPlacements: I693DomCombPlacement[] = []

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

        const formWrap = document.createElement('div')
        formWrap.className = 'absolute inset-0 z-10'

        const formLayerDiv = document.createElement('div')
        formLayerDiv.className = 'annotationLayer absolute inset-0'

        const annHostDiv = document.createElement('div')
        annHostDiv.className = 'absolute inset-0 z-30'
        annHostDiv.style.pointerEvents = 'none'

        pageBox.appendChild(canvas)
        formWrap.appendChild(formLayerDiv)
        pageBox.appendChild(formWrap)
        pageBox.appendChild(annHostDiv)
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
        fitPdfFormLayerFonts(formLayerDiv)
        lockPreviewFormLayer(formLayerDiv)
        addPreviewInteractionShield(formWrap)

        nextPreviewCombPlacements.push(
          ...discoverCombPlacementsFromLayer(formLayerDiv, pageBox, pageNum)
        )

        nextPreviewPageHosts.push({
          page: pageNum,
          width: viewport.width,
          height: viewport.height,
          hostEl: annHostDiv,
          pageBoxEl: pageBox,
        })
      }

      setPreviewCombPlacements(nextPreviewCombPlacements)
      setPreviewPageHosts(nextPreviewPageHosts)
    },
    [t]
  )

  const refreshPreview = useCallback(async () => {
    if (mode !== 'preview') return
    setPreviewLoading(true)
    setPdfReady(false)
    try {
      const ok = await saveCurrent(true)
      if (!ok) {
        setPreviewLoading(false)
        return
      }
      const bytes = await fetchFilledPdfBytes()
      bytesRef.current = clonePdfBytes(bytes)
      setPreviewTick((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview refresh failed')
      setPreviewLoading(false)
    }
  }, [fetchFilledPdfBytes, mode, saveCurrent])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        await loadFormAndAnnotations()
        if (!cancelled) setEditorTick((n) => n + 1)
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load I-693')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadFormAndAnnotations])

  useEffect(() => {
    if (mode !== 'editor' || editorTick === 0) return
    const host = editorHostRef.current
    if (!host) return

    void (async () => {
      try {
        await renderEditorPdf(formRef.current)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'PDF editor failed to load')
      }
    })()

    return () => {
      host.innerHTML = ''
      pdfRef.current = null
      setPageHosts([])
      setCombPlacements([])
      setPdfReady(false)
    }
  }, [editorTick, mode, renderEditorPdf])

  useLayoutEffect(() => {
    if (mode !== 'preview' || previewTick === 0 || !bytesRef.current) return

    let cancelled = false

    const run = async (attempt = 0) => {
      const host = previewHostRef.current
      if (!host) {
        if (attempt < 40 && !cancelled) {
          requestAnimationFrame(() => void run(attempt + 1))
        } else if (!cancelled) {
          toast.error('Preview could not start — try again')
          setPreviewLoading(false)
        }
        return
      }

      try {
        setPreviewError(null)
        await renderPreviewPdf(clonePdfBytes(bytesRef.current!), scale)
        if (!cancelled) setPdfReady(true)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'PDF preview failed to load'
        if (!cancelled) {
          setPreviewError(message)
          const quiet =
            message.toLowerCase().includes('password') ||
            message.toLowerCase().includes('encryption')
          if (!quiet) toast.error(message)
          setPdfReady(true)
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
      if (previewHostRef.current) previewHostRef.current.innerHTML = ''
      setPreviewPageHosts([])
      setPreviewCombPlacements([])
      setPdfReady(false)
    }
  }, [mode, previewTick, renderPreviewPdf, scale])

  const switchToPreview = useCallback(async () => {
    if (mode === 'preview') return
    setPreviewLoading(true)
    setPdfReady(false)
    setPreviewError(null)
    setTool('none')
    try {
      const ok = await saveCurrent(true)
      if (!ok) {
        setPreviewLoading(false)
        return
      }
      const bytes = await fetchFilledPdfBytes()
      bytesRef.current = clonePdfBytes(bytes)
      setMode('preview')
      setPreviewTick((n) => n + 1)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Preview failed'
      setPreviewError(message)
      const quiet =
        message.toLowerCase().includes('password') ||
        message.toLowerCase().includes('encryption')
      if (!quiet) toast.error(message)
      setPreviewLoading(false)
      setPdfReady(true)
    }
  }, [fetchFilledPdfBytes, mode, saveCurrent])

  const switchToEditor = useCallback(() => {
    if (mode === 'editor') return
    setPreviewError(null)
    setPreviewPageHosts([])
    setPreviewCombPlacements([])
    setMode('editor')
    setEditorTick((n) => n + 1)
  }, [mode])

  const downloadPdf = useCallback(async () => {
    if (mode !== 'preview') return
    setDownloadLoading(true)
    try {
      const ok = await saveCurrent(false)
      if (!ok) return
      const bytes = await fetchFilledPdfBytes(false)
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
      setDownloadLoading(false)
    }
  }, [encounterId, fetchFilledPdfBytes, mode, saveCurrent, t])

  const onPickSupportingDocuments = useCallback(() => {
    supportingInputRef.current?.click()
  }, [])

  const onSupportingDocumentsSelected = useCallback((fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    const supported = files.filter((file) => {
      const name = file.name.toLowerCase()
      return (
        file.type === 'application/pdf' ||
        name.endsWith('.pdf') ||
        file.type.startsWith('image/') ||
        /\.(png|jpe?g|webp)$/.test(name)
      )
    })
    if (files.length > 0 && supported.length !== files.length) {
      toast.warning('Only PDF or image documents can be opened in SplitView.')
    }
    const pdfs = supported.filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )
    if (supported.length > pdfs.length) {
      toast.info('Images open in SplitView. AI fill uses PDFs only.')
    }
    setSupportingFiles(supported)
    setSplitDocIndex(0)
    setSplitViewOpen(pdfs.length > 0)
    setAiDraft(null)
  }, [])

  const hideSplitView = useCallback(() => {
    setSplitViewOpen(false)
  }, [])

  const removeSupportingDocument = useCallback((index: number) => {
    setSupportingFiles((prev) => {
      const next = prev.filter((_, fileIndex) => fileIndex !== index)
      if (next.length === 0) {
        setSplitViewOpen(false)
        setSplitDocIndex(0)
        if (supportingInputRef.current) supportingInputRef.current.value = ''
        return next
      }

      setSplitDocIndex((current) => {
        if (current > index) return current - 1
        if (current >= next.length) return Math.max(0, next.length - 1)
        return current
      })
      return next
    })
  }, [])

  const supportingPdfFiles = useMemo(
    () =>
      supportingFiles.filter(
        (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      ),
    [supportingFiles]
  )

  const generateSupportingDocumentDraft = useCallback(async () => {
    if (supportingPdfFiles.length === 0) {
      toast.error('Select at least one supporting PDF first')
      return
    }

    setSupportingLoading(true)
    try {
      if (pdfRef.current) {
        const next = await extractI693FormFromPdfDocument(pdfRef.current, formRef.current)
        setForm(next)
        formRef.current = next
      }

      const body = new FormData()
      for (const file of supportingPdfFiles) body.append('documents', file)
      body.append('current_form', JSON.stringify(formRef.current))

      const res = await fetch(`/api/encounters/${encounterId}/i693/supporting-documents`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        body,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || json.message || 'Supporting document AI fill failed')

      const draft: I693SupportingDocumentDraft = {
        form_data: parseFormDataFromApi(json.form_data),
        evidence: Array.isArray(json.evidence) ? json.evidence : [],
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
        filled_fields: Array.isArray(json.filled_fields) ? json.filled_fields : [],
        filled_count: Number(json.filled_count ?? 0),
        model: String(json.model ?? 'OpenAI'),
        documents: Array.isArray(json.documents) ? json.documents : [],
      }
      setAiDraft(draft)
      if (draft.filled_count > 0) {
        toast.success(`AI draft generated with ${draft.filled_count} fields`)
      } else {
        toast.warning('AI draft generated, but no supported fields were found')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Supporting document AI fill failed')
    } finally {
      setSupportingLoading(false)
    }
  }, [encounterId, supportingPdfFiles])

  const acceptAiDraft = useCallback(() => {
    if (!aiDraft) return
    const next = mergeAcceptedI693AiDraft(formRef.current, aiDraft.form_data)
    setForm(next)
    formRef.current = next
    setDirty(true)
    setAiDraft(null)
    setSplitViewOpen(false)
    setSupportingFiles([])
    if (supportingInputRef.current) supportingInputRef.current.value = ''
    if (mode !== 'editor') setMode('editor')
    setEditorTick((n) => n + 1)
    toast.success('AI draft applied to the default editor. Review and save when ready.')
  }, [aiDraft, mode])

  const rejectAiDraft = useCallback(() => {
    setAiDraft(null)
    if (supportingInputRef.current) supportingInputRef.current.value = ''
    toast.info('AI draft rejected')
  }, [])

  const onPickImage = useCallback(() => {
    imageInputRef.current?.click()
  }, [])

  const onImageSelected = useCallback((file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        pendingImageUrlRef.current = reader.result
        setTool('image')
        toast.success('Image selected. Click on page to place it.')
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const addAnnotationAt = useCallback(
    (page: number, pageWidth: number, pageHeight: number, xPx: number, yPx: number) => {
      if (tool === 'none') return
      const xPercent = toPercent(xPx, pageWidth)
      const yPercent = toPercent(yPx, pageHeight)

      let ann: I693Annotation | null = null
      if (tool === 'text') {
        ann = {
          id: uid(),
          page,
          type: 'text',
          xPercent,
          yPercent,
          widthPercent: 0.2,
          heightPercent: 0.028,
          value: 'Text',
        }
      } else if (tool === 'cross') {
        ann = {
          id: uid(),
          page,
          type: 'cross',
          xPercent,
          yPercent,
          sizePercent: 0.03,
        }
      } else if (tool === 'image' && pendingImageUrlRef.current) {
        ann = {
          id: uid(),
          page,
          type: 'image',
          xPercent,
          yPercent,
          widthPercent: 0.18,
          heightPercent: 0.08,
          imageUrl: pendingImageUrlRef.current,
        }
        pendingImageUrlRef.current = null
      }

      if (!ann) return
      commitAnnotations((prev) => [...prev, ann])
      setDirty(true)
      if (tool !== 'text') setTool('none')
    },
    [commitAnnotations, tool]
  )

  const updateAnnotation = useCallback(
    (id: string, updater: (a: I693Annotation) => I693Annotation) => {
      commitAnnotations((prev) => prev.map((a) => (a.id === id ? updater(a) : a)))
      setDirty(true)
    },
    [commitAnnotations]
  )

  const removeAnnotation = useCallback(
    (id: string) => {
      commitAnnotations((prev) => prev.filter((a) => a.id !== id))
      setDirty(true)
    },
    [commitAnnotations]
  )

  const editorAnnotationPortals = useMemo(() => {
    if (mode !== 'editor') return null
    return pageHosts.map((pageHost) => {
      const pageAnnotations = annotations.filter((a) => a.page === pageHost.page)
      const layer = (
        <div className="absolute inset-0 z-30" style={{ pointerEvents: 'none' }}>
          {tool !== 'none' && (
            <div
              className="absolute inset-0"
              style={{ pointerEvents: 'auto' }}
              onMouseDown={(e) => {
                if (e.target !== e.currentTarget) return
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                addAnnotationAt(
                  pageHost.page,
                  pageHost.width,
                  pageHost.height,
                  e.clientX - rect.left,
                  e.clientY - rect.top
                )
              }}
            />
          )}
          {pageAnnotations.map((a) => {
            if (a.type === 'text') {
              const x = toPx(a.xPercent, pageHost.width)
              const y = toPx(a.yPercent, pageHost.height)
              const w = Math.max(60, toPx(a.widthPercent, pageHost.width))
              const h = Math.max(24, toPx(a.heightPercent, pageHost.height))
              const fontSize = fittedAnnotationFontSize(a.value, w, h)
              return (
                <Rnd
                  key={a.id}
                  position={{ x, y }}
                  size={{ width: w, height: h }}
                  bounds="parent"
                  dragHandleClassName="ann-move-handle"
                  style={{ pointerEvents: 'auto', zIndex: 40 }}
                  onDragStop={(_e, d) =>
                    updateAnnotation(a.id, (prev) => ({
                      ...(prev as I693TextAnnotation),
                      xPercent: toPercent(d.x, pageHost.width),
                      yPercent: toPercent(d.y, pageHost.height),
                    }))
                  }
                  onResizeStop={(_e, _dir, ref, _delta, position) =>
                    updateAnnotation(a.id, (prev) => ({
                      ...(prev as I693TextAnnotation),
                      xPercent: toPercent(position.x, pageHost.width),
                      yPercent: toPercent(position.y, pageHost.height),
                      widthPercent: toPercent(ref.offsetWidth, pageHost.width),
                      heightPercent: toPercent(ref.offsetHeight, pageHost.height),
                    }))
                  }
                >
                  <div className="h-full w-full bg-white/80 border border-sky-500 rounded-sm shadow-sm p-1">
                    <div className="absolute -top-8 left-0 flex items-center gap-1 bg-white/95 border border-slate-200 rounded px-2 py-1 text-sm">
                      <button type="button" className="ann-move-handle cursor-move px-2 leading-none" title="Move">
                        <span aria-hidden>↕</span>
                      </button>
                      <span className="px-2 text-slate-600 leading-none" title="Resize from box corner">↘</span>
                      <button
                        type="button"
                        className="px-2 text-rose-600 leading-none"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeAnnotation(a.id)
                        }}
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      value={a.value}
                      onChange={(e) =>
                        updateAnnotation(a.id, (prev) => ({
                          ...(prev as I693TextAnnotation),
                          value: e.target.value,
                        }))
                      }
                      className="h-full w-full resize-none bg-transparent outline-none text-black whitespace-nowrap overflow-hidden"
                      style={{ fontSize: `${fontSize}px`, lineHeight: 1.2 }}
                    />
                  </div>
                </Rnd>
              )
            }

            if (a.type === 'cross') {
              const x = toPx(a.xPercent, pageHost.width)
              const y = toPx(a.yPercent, pageHost.height)
              const size = Math.max(16, toPx(a.sizePercent, pageHost.width))
              return (
                <Rnd
                  key={a.id}
                  position={{ x, y }}
                  size={{ width: size, height: size }}
                  bounds="parent"
                  lockAspectRatio
                  dragHandleClassName="ann-move-handle"
                  style={{ pointerEvents: 'auto', zIndex: 40 }}
                  onDragStop={(_e, d) =>
                    updateAnnotation(a.id, (prev) => ({
                      ...(prev as I693CrossAnnotation),
                      xPercent: toPercent(d.x, pageHost.width),
                      yPercent: toPercent(d.y, pageHost.height),
                    }))
                  }
                  onResizeStop={(_e, _dir, ref, _delta, position) =>
                    updateAnnotation(a.id, (prev) => ({
                      ...(prev as I693CrossAnnotation),
                      xPercent: toPercent(position.x, pageHost.width),
                      yPercent: toPercent(position.y, pageHost.height),
                      sizePercent: toPercent(ref.offsetWidth, pageHost.width),
                    }))
                  }
                >
                  <div className="relative h-full w-full">
                    <div className="absolute -top-8 left-0 flex items-center gap-1 bg-white/95 border border-slate-200 rounded px-2 py-1 text-sm">
                      <button type="button" className="ann-move-handle cursor-move px-2 leading-none" title="Move">
                        <span aria-hidden>↕</span>
                      </button>
                      <button
                        type="button"
                        className="px-2 text-rose-600 leading-none"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeAnnotation(a.id)
                        }}
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                    <svg viewBox="0 0 100 100" className="h-full w-full pointer-events-none">
                      <line x1="8" y1="8" x2="92" y2="92" stroke="black" strokeWidth="10" />
                      <line x1="92" y1="8" x2="8" y2="92" stroke="black" strokeWidth="10" />
                    </svg>
                  </div>
                </Rnd>
              )
            }

            const x = toPx(a.xPercent, pageHost.width)
            const y = toPx(a.yPercent, pageHost.height)
            const w = Math.max(48, toPx(a.widthPercent, pageHost.width))
            const h = Math.max(24, toPx(a.heightPercent, pageHost.height))
            return (
              <Rnd
                key={a.id}
                position={{ x, y }}
                size={{ width: w, height: h }}
                bounds="parent"
                dragHandleClassName="ann-move-handle"
                style={{ pointerEvents: 'auto', zIndex: 40 }}
                onDragStop={(_e, d) =>
                  updateAnnotation(a.id, (prev) => ({
                    ...(prev as I693ImageAnnotation),
                    xPercent: toPercent(d.x, pageHost.width),
                    yPercent: toPercent(d.y, pageHost.height),
                  }))
                }
                onResizeStop={(_e, _dir, ref, _delta, position) =>
                  updateAnnotation(a.id, (prev) => ({
                    ...(prev as I693ImageAnnotation),
                    xPercent: toPercent(position.x, pageHost.width),
                    yPercent: toPercent(position.y, pageHost.height),
                    widthPercent: toPercent(ref.offsetWidth, pageHost.width),
                    heightPercent: toPercent(ref.offsetHeight, pageHost.height),
                  }))
                }
              >
                <div className="relative h-full w-full">
                  <div className="absolute -top-8 left-0 flex items-center gap-1 bg-white/95 border border-slate-200 rounded px-2 py-1 text-sm">
                    <button type="button" className="ann-move-handle cursor-move px-2 leading-none" title="Move">
                      <span aria-hidden>↕</span>
                    </button>
                    <span className="px-2 text-slate-600 leading-none" title="Resize from box corner">↘</span>
                    <button
                      type="button"
                      className="px-2 text-rose-600 leading-none"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeAnnotation(a.id)
                      }}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                  <img src={a.imageUrl} alt="annotation" className="h-full w-full object-contain border border-sky-500 bg-white/70" />
                </div>
              </Rnd>
            )
          })}
        </div>
      )
      return createPortal(layer, pageHost.hostEl, `ann-page-${pageHost.page}`)
    })
  }, [addAnnotationAt, annotations, mode, pageHosts, tool, updateAnnotation, removeAnnotation])

  const previewAnnotationPortals = useMemo(() => {
    if (mode !== 'preview') return null
    return previewPageHosts.map((pageHost) => {
      const pageAnnotations = annotations.filter((a) => a.page === pageHost.page)
      const layer = (
        <div className="absolute inset-0 z-30 pointer-events-none">
          {pageAnnotations.map((a) => {
            if (a.type === 'text') {
              const x = toPx(a.xPercent, pageHost.width)
              const y = toPx(a.yPercent, pageHost.height)
              const w = Math.max(60, toPx(a.widthPercent, pageHost.width))
              const h = Math.max(24, toPx(a.heightPercent, pageHost.height))
              const fontSize = fittedAnnotationFontSize(a.value, w, h)
              return (
                <div
                  key={a.id}
                  className="absolute overflow-hidden text-black"
                  style={{
                    left: x,
                    top: y,
                    width: w,
                    height: h,
                    fontSize: `${fontSize}px`,
                    lineHeight: 1.2,
                  }}
                >
                  {a.value}
                </div>
              )
            }

            if (a.type === 'cross') {
              const x = toPx(a.xPercent, pageHost.width)
              const y = toPx(a.yPercent, pageHost.height)
              const size = Math.max(16, toPx(a.sizePercent, pageHost.width))
              return (
                <div
                  key={a.id}
                  className="absolute"
                  style={{ left: x, top: y, width: size, height: size }}
                >
                  <svg viewBox="0 0 100 100" className="h-full w-full">
                    <line x1="8" y1="8" x2="92" y2="92" stroke="black" strokeWidth="10" />
                    <line x1="92" y1="8" x2="8" y2="92" stroke="black" strokeWidth="10" />
                  </svg>
                </div>
              )
            }

            const x = toPx(a.xPercent, pageHost.width)
            const y = toPx(a.yPercent, pageHost.height)
            const w = Math.max(48, toPx(a.widthPercent, pageHost.width))
            const h = Math.max(24, toPx(a.heightPercent, pageHost.height))
            return (
              <img
                key={a.id}
                src={a.imageUrl}
                alt=""
                className="absolute object-contain"
                style={{ left: x, top: y, width: w, height: h }}
              />
            )
          })}
        </div>
      )
      return createPortal(layer, pageHost.hostEl, `preview-ann-${pageHost.page}`)
    })
  }, [annotations, mode, previewPageHosts])

  const previewCombPortals = useMemo(() => {
    if (mode !== 'preview' || previewCombPlacements.length === 0) return null

    return previewPageHosts.flatMap((pageHost) => {
      const fieldsOnPage = previewCombPlacements.filter((f) => f.page === pageHost.page)

      return fieldsOnPage.map((field) => {
        const raw = getNestedValue(form as unknown as Record<string, unknown>, field.key)
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
          `preview-comb-${field.widgetName}`
        )
      })
    })
  }, [form, mode, previewCombPlacements, previewPageHosts])

  const charCellPortals = useMemo(() => {
    if (mode !== 'editor' || combPlacements.length === 0) return null

    return pageHosts.flatMap((pageHost) => {
      const fieldsOnPage = combPlacements.filter((f) => f.page === pageHost.page)

      return fieldsOnPage.map((field) => {
        const raw = getNestedValue(form as unknown as Record<string, unknown>, field.key)
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
            onChange={(v) => void updateCombField(field.key, v)}
          />,
          pageHost.pageBoxEl,
          `comb-${field.widgetName}`
        )
      })
    })
  }, [combPlacements, form, mode, pageHosts, updateCombField])

  if (loading) {
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
              {mode === 'editor'
                ? 'Editor mode with PDF fields + lightweight annotations (text, cross, image).'
                : 'Preview mode — auto-saved view with custom controls.'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => void switchToEditor()}
              disabled={previewLoading || saving}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                mode === 'editor' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Editor mode
            </button>
            <button
              type="button"
              onClick={() => void switchToPreview()}
              disabled={previewLoading || saving}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                mode === 'preview' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Preview mode
            </button>
          </div>

          {(previewLoading || saving) && (
            <div className="flex items-center gap-2 px-3 py-1 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg">
              <LoadingSpinner
                compact
                size="xs"
                message={mode === 'editor' ? 'Saving editor changes...' : 'Preparing preview...'}
              />
            </div>
          )}

          {mode === 'editor' && (
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                title="Select / normal edit mode"
                onClick={() => setTool('none')}
                className={`h-8 w-8 rounded-md border text-base leading-none ${
                  tool === 'none' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-transparent text-slate-700 hover:bg-slate-50'
                }`}
              >
                ↖
              </button>
              <button
                type="button"
                title="Add text"
                onClick={() => setTool('text')}
                className={`h-8 w-8 rounded-md border text-base font-semibold leading-none ${
                  tool === 'text' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-transparent text-slate-700 hover:bg-slate-50'
                }`}
              >
                T
              </button>
              <button
                type="button"
                title="Add cross"
                onClick={() => setTool('cross')}
                className={`h-8 w-8 rounded-md border text-base font-semibold leading-none ${
                  tool === 'cross' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-transparent text-slate-700 hover:bg-slate-50'
                }`}
              >
                ✕
              </button>
              <button
                type="button"
                title="Add image"
                onClick={onPickImage}
                className={`flex h-8 w-8 items-center justify-center rounded-md border leading-none ${
                  tool === 'image' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-transparent text-slate-700 hover:bg-slate-50'
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </button>
            </div>
          )}

          {mode === 'preview' && (
            <>
              <button
                type="button"
                title="Refresh preview"
                onClick={() => void refreshPreview()}
                disabled={previewLoading || downloadLoading}
                className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-base font-medium disabled:opacity-50"
              >
                ↻
              </button>
              <button
                type="button"
                title="Zoom out"
                onClick={() => setScale((s) => Math.max(MIN_SCALE, Number((s - 0.1).toFixed(2))))}
                disabled={previewLoading || downloadLoading}
                className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-base font-medium disabled:opacity-50"
              >
                −
              </button>
              <div className="px-3 py-2 text-sm text-slate-600">{Math.round(scale * 100)}%</div>
              <button
                type="button"
                title="Zoom in"
                onClick={() => setScale((s) => Math.min(MAX_SCALE, Number((s + 0.1).toFixed(2))))}
                disabled={previewLoading || downloadLoading}
                className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-base font-medium disabled:opacity-50"
              >
                +
              </button>
              <button
                type="button"
                title={t('i693.download_pdf')}
                onClick={() => void downloadPdf()}
                disabled={previewLoading || downloadLoading}
                className="h-8 w-8 rounded-lg bg-[#2E6EF3] hover:bg-[#1f5ad2] text-white text-base font-medium disabled:opacity-50"
              >
                ⭳
              </button>
            </>
          )}
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={(e) => onImageSelected(e.target.files?.[0] ?? null)}
      />

      <input
        ref={supportingInputRef}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/jpg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          onSupportingDocumentsSelected(e.target.files)
          e.currentTarget.value = ''
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Supporting documents</h3>
          <p className="mt-1 text-xs text-slate-500">
            {supportingFiles.length > 0
              ? t('i693.splitview_open_hint')
              : t('i693.splitview_empty_hint')}
          </p>
          {supportingFiles.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {supportingFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className={`inline-flex max-w-full items-center gap-1 rounded-lg border pl-2.5 pr-1 py-1 text-xs font-medium ${
                    splitViewOpen && splitDocIndex === index
                      ? 'border-violet-300 bg-violet-50 text-violet-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSplitDocIndex(index)
                      setSplitViewOpen(true)
                    }}
                    className="max-w-[200px] truncate text-left hover:underline"
                    title={file.name}
                  >
                    {file.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSupportingDocument(index)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                    title={t('i693.splitview_remove_document')}
                    aria-label={t('i693.splitview_remove_document')}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPickSupportingDocuments}
            disabled={supportingLoading || saving || previewLoading}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <span>Select PDFs</span>
            {supportingFiles.length > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold leading-none text-white">
                {supportingFiles.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => void generateSupportingDocumentDraft()}
            disabled={supportingLoading || saving || previewLoading || supportingPdfFiles.length === 0}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {supportingLoading ? 'Generating…' : 'Generate AI draft'}
          </button>
        </div>
      </div>

      <div
        className={`grid gap-4 ${
          splitViewOpen || aiDraft ? 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,44%)]' : ''
        }`}
      >
        <div className="min-w-0 space-y-3">
          <div className="relative bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden max-h-[calc(100vh-14rem)]">
            {previewError && mode === 'preview' ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-100/95 p-8 text-center">
                <p className="text-sm font-medium text-red-700">{previewError}</p>
                <button
                  type="button"
                  onClick={() => void switchToEditor()}
                  className="px-4 py-2 rounded-lg bg-[#2E6EF3] text-white text-sm font-medium"
                >
                  Back to editor
                </button>
              </div>
            ) : !pdfReady ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
                <LoadingSpinner
                  message={
                    previewLoading || saving
                      ? mode === 'preview'
                        ? 'Saving and preparing preview…'
                        : t('i693.pdf_editor_loading')
                      : t('i693.pdf_editor_loading')
                  }
                  variant="light"
                />
              </div>
            ) : null}
            {mode === 'editor' ? (
              <>
                <div
                  ref={editorHostRef}
                  className="i693-pdfjs-editor min-h-[480px] p-4 md:p-6 overflow-auto max-h-[calc(100vh-14rem)] [&_.annotationLayer]:pointer-events-auto [&_.annotationLayer_input]:text-slate-900 [&_.annotationLayer_input]:bg-white/90"
                />
                {charCellPortals}
              </>
            ) : (
              <div
                ref={previewHostRef}
                className="i693-pdfjs-preview min-h-[480px] p-4 md:p-6 overflow-auto max-h-[calc(100vh-14rem)] [&_.annotationLayer]:pointer-events-none [&_.annotationLayer_input]:pointer-events-none [&_.annotationLayer_input]:cursor-default [&_.annotationLayer_input]:select-none [&_.annotationLayer_input]:caret-transparent"
              />
            )}
            {editorAnnotationPortals}
            {previewAnnotationPortals}
            {previewCombPortals}
          </div>
          {dirty && (
            <p className="text-xs text-amber-700">
              Unsaved PDF changes. Switching to Preview mode will auto-save form + annotations.
            </p>
          )}
        </div>

        {(splitViewOpen || aiDraft) && (
          <div className="flex min-w-0 flex-col gap-4">
            {splitViewOpen && supportingFiles.length > 0 ? (
              <I693SplitView
                files={supportingFiles}
                activeIndex={splitDocIndex}
                onActiveIndexChange={setSplitDocIndex}
                onClosePanel={hideSplitView}
                onRemoveDocument={removeSupportingDocument}
              />
            ) : null}
            {aiDraft ? (
              <I693AiDraftPdfReview
                draft={aiDraft}
                onAccept={acceptAiDraft}
                onReject={rejectAiDraft}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
