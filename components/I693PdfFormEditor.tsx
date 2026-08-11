'use client'

import 'pdfjs-dist/web/pdf_viewer.css'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { formatCalendarDate } from '@/lib/datetime/date-input'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { I693FormData } from '@/lib/i693/types'
import { EMPTY_I693_FORM } from '@/lib/i693/types'
import { extractFormDataFromApi, parseFormDataFromApi, countFilledI693Fields } from '@/lib/i693/form-api'
import { I693PdfCharCellField } from '@/components/I693PdfCharCellField'
import { I693SplitView } from '@/components/I693SplitView'
import {
  type I693SplitViewItem,
  type I693SplitViewSource,
  type PatientChartDocumentRef,
  isPreviewablePatientChartDocument,
  localFileToSplitItem,
  patientChartDocToSplitItem,
} from '@/lib/i693/split-view-document'
import {
  applyI693FormToPdfDocument,
  applyApplicantHeaderMirrors,
  enforceSingleSelectMarkGroup,
  extractI693FormFromPdfDocumentRespectingUserEdits,
  syncApplicantHeaderMirrorDom,
  unlockForceEditablePdfWidgets,
  patchForceEditableAnnotations,
} from '@/lib/i693/pdfjs-form-bridge'
import { formatI693WidgetValue } from '@/lib/i693/pdf-field-formatters'
import { widgetFieldIndex, widgetShortName } from '@/lib/i693/pdf-widget-map'
import {
  discoverCombPlacementsFromLayer,
  setCombFieldOnPdfDocument,
  type I693DomCombPlacement,
} from '@/lib/i693/pdf-comb-fields'
import { getNestedValue, setNestedValue } from '@/lib/i693/field-sections'
import { loadPdfJsDocument } from '@/lib/i693/pdfjs-load'
import { printPdfBlob } from '@/lib/patient-documents/print-document'
import { mergeAcceptedI693AiDraft } from '@/lib/i693/supporting-documents/merge-draft'
import type { I693LocationAutofillMeta } from '@/lib/i693/location-autofill'
import { useT } from '@/lib/i18n'
import { ImmigrationWorkflowStatusBadge } from '@/components/ImmigrationWorkflowStatusBadge'
import { useImmigrationWorkflowCase } from '@/lib/hooks/use-immigration-workflow-case'

const PDF_URL = '/forms/i-693-template.pdf'
const DEFAULT_SCALE = 1.2
/** Form pane share when split is open (rest is chart/doc pane). Either side can grow until the other hits the min. */
const SPLIT_FORM_RATIO_DEFAULT = 0.64
const SPLIT_FORM_RATIO_MIN = 0.22
const SPLIT_FORM_RATIO_MAX = 0.85
/** Visible sash width; hit area is wider for easier grabbing (VS Code–style). */
const SPLIT_SASH_WIDTH_PX = 5
const SPLIT_SASH_HIT_PX = 14

type Props = {
  encounterId: number
  patientName?: string
  onBack?: () => void
}

type PagePortalHost = {
  page: number
  width: number
  height: number
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

function isTextFormWidget(node: EventTarget | Element | null): node is HTMLInputElement | HTMLTextAreaElement {
  if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return false
  if (node instanceof HTMLTextAreaElement) return true
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden'].includes(node.type)
}

function fitPdfFormWidgetFont(el: HTMLInputElement | HTMLTextAreaElement): void {
  const width = el.clientWidth || el.getBoundingClientRect().width
  const height = el.clientHeight || el.getBoundingClientRect().height
  if (!width || !height) return

  if (el.name && el.name.includes('Remarks')) {
    el.style.boxSizing = 'border-box'
    el.style.fontSize = '11.5px'
    el.style.lineHeight = '14px'
    el.style.padding = '2px'
    el.style.overflow = 'hidden'
    el.style.whiteSpace = 'pre-wrap'
    return
  }

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

type TbClassification = 'Positive' | 'Negative' | 'Indeterminate' | 'Unable to Determine'

type TbFlagResult = {
  classification: TbClassification
  confidence: number
  borderline: boolean
  reasons: string[]
  values: {
    nil: number | null
    tb1_nil: number | null
    tb2_nil: number | null
    mitogen_nil: number | null
  }
  document?: { file_name?: string | null } | null
}

/** Solid fill so the classification reads at a glance from across the toolbar. */
const TB_FLAG_STYLES: Record<TbClassification, string> = {
  Positive: 'border-red-700 bg-red-600 text-white hover:bg-red-700',
  Negative: 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700',
  Indeterminate: 'border-amber-600 bg-amber-500 text-white hover:bg-amber-600',
  'Unable to Determine': 'border-slate-500 bg-slate-500 text-white hover:bg-slate-600',
}

function formatTbValue(value: number | null): string {
  return value == null ? '—' : String(value)
}

export function I693PdfFormEditor({ encounterId, patientName, onBack }: Props) {
  const { t } = useT()
  const { caseRow: workflowCase, loading: workflowCaseLoading } = useImmigrationWorkflowCase(encounterId)
  const [loading, setLoading] = useState(true)
  const [pdfReady, setPdfReady] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [editorTick, setEditorTick] = useState(0)
  const [form, setForm] = useState<I693FormData>(EMPTY_I693_FORM)
  const [pageHosts, setPageHosts] = useState<PagePortalHost[]>([])
  const [combPlacements, setCombPlacements] = useState<I693DomCombPlacement[]>([])
  const [splitViewOpen, setSplitViewOpen] = useState(false)
  const [splitDocIndex, setSplitDocIndex] = useState<number | null>(null)
  const [splitViewSource, setSplitViewSource] = useState<I693SplitViewSource>('patient_chart')
  const [supportingSplitItems, setSupportingSplitItems] = useState<I693SplitViewItem[]>([])
  const [splitFormRatio, setSplitFormRatio] = useState(SPLIT_FORM_RATIO_DEFAULT)
  const splitRowRef = useRef<HTMLDivElement>(null)
  const splitDragRef = useRef<{ startX: number; startRatio: number } | null>(null)
  const [splitResizing, setSplitResizing] = useState(false)
  const [patientId, setPatientId] = useState<number | null>(null)
  const [lastVisitDate, setLastVisitDate] = useState<string | null>(null)
  const [patientChartDocs, setPatientChartDocs] = useState<PatientChartDocumentRef[]>([])
  const [patientChartDocsLoading, setPatientChartDocsLoading] = useState(false)
  const [locationAutofill, setLocationAutofill] = useState<I693LocationAutofillMeta | null>(null)
  const [locationAutofillLoading, setLocationAutofillLoading] = useState(false)
  const [aiChartLoading, setAiChartLoading] = useState(false)
  const [tbFlagLoading, setTbFlagLoading] = useState(false)
  const [tbFlag, setTbFlag] = useState<TbFlagResult | null>(null)
  const [tbFileName, setTbFileName] = useState<string | null>(null)
  const tbFileInputRef = useRef<HTMLInputElement>(null)
  const editorHostRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null)
  const pageHostsRef = useRef<PagePortalHost[]>([])
  const formRef = useRef(form)
  formRef.current = form

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

  const loadForm = useCallback(async () => {
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
    setDirty(false)
    const pid = Number(json.patient_id)
    setPatientId(Number.isFinite(pid) && pid > 0 ? pid : null)
  }, [encounterId])

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
    const next = await extractI693FormFromPdfDocumentRespectingUserEdits(pdf, formRef.current)
    setForm(next)
    formRef.current = next
    setDirty(true)

    const fieldObjects = await pdf.getFieldObjects()
    if (fieldObjects) applyApplicantHeaderMirrors(pdf, next, fieldObjects)

    requestAnimationFrame(() => {
      for (const host of pageHostsRef.current) {
        if (host.page <= 1) continue
        const layer = host.pageBoxEl.querySelector('.annotationLayer')
        if (!(layer instanceof HTMLElement)) continue
        syncApplicantHeaderMirrorDom(layer, formRef.current, { continuationPage: true })
        fitPdfFormLayerFonts(layer)
      }
    })
  }, [])

  const saveCurrent = useCallback(
    async (showToast: boolean): Promise<boolean> => {
      // Commit the field the user is still editing: clicking Save doesn't blur
      // the active widget, so pdf.js hasn't flushed the typed value into
      // annotation storage yet. Blur it and wait a frame before extracting,
      // otherwise a value typed over an AI/prefilled field is read as the old
      // one and the edit appears not to save.
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      }
      if (pdfRef.current) {
        const next = await extractI693FormFromPdfDocumentRespectingUserEdits(
          pdfRef.current,
          formRef.current
        )
        setForm(next)
        formRef.current = next
      }

      setSaving(true)
      try {
        if (formRef.current.vaccination_grid?.length) {
          console.debug('[I693PdfFormEditor] saveCurrent vaccination_grid:', {
            count: formRef.current.vaccination_grid.length,
            sample: formRef.current.vaccination_grid[0],
          })
        }
        const res = await fetch(`/api/encounters/${encounterId}/i693`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form_data: formRef.current,
            status: 'draft',
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Save failed')
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

  const loadLocationAutofillMeta = useCallback(async () => {
    try {
      const res = await fetch(`/api/encounters/${encounterId}/i693/location-autofill`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const json = (await res.json()) as I693LocationAutofillMeta
      if (res.ok) setLocationAutofill(json)
    } catch {
      setLocationAutofill(null)
    }
  }, [encounterId])

  const applyLocationAutofill = useCallback(async () => {
    setLocationAutofillLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/i693/location-autofill`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Location auto-fill failed')

      const next = mergeAcceptedI693AiDraft(
        formRef.current,
        parseFormDataFromApi(json.form_data)
      )
      setForm(next)
      formRef.current = next
      setDirty(true)
      setLocationAutofill({
        available: true,
        region_label: json.region_label ?? null,
        location_title: json.location_title ?? null,
        location_address: json.location_address ?? null,
        location_group: json.location_group ?? null,
        location_id: json.location_id ?? null,
      })
      setEditorTick((n) => n + 1)
      toast.success(t('i693.location_autofill_applied'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Location auto-fill failed')
    } finally {
      setLocationAutofillLoading(false)
    }
  }, [encounterId, t])

  const aiFillFromChart = useCallback(async () => {
    setAiChartLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/i693/ai-fill`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || json.message || 'AI fill failed')

      const raw =
        extractFormDataFromApi(json) ??
        (json.submission ? extractFormDataFromApi(json.submission) : null)
      const next = parseFormDataFromApi(raw)
      setForm(next)
      formRef.current = next
      setDirty(true)
      setEditorTick((n) => n + 1)

      const filled = countFilledI693Fields(next)
      if (filled === 0) {
        toast.warning(t('i693.ai_empty_warn'))
      } else {
        toast.success(t('i693.ai_done'))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI fill failed')
    } finally {
      setAiChartLoading(false)
    }
  }, [encounterId, t])

  const flagTb = useCallback(async (file: File) => {
    setTbFlagLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/encounters/${encounterId}/i693/tb-analysis`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || json.message || t('i693.tb_flag_failed'))

      const result = json as TbFlagResult
      setTbFlag(result)

      if (result.classification === 'Positive') {
        toast.error(t('i693.tb_flag_positive'))
      } else if (result.classification === 'Negative') {
        toast.success(t('i693.tb_flag_negative'))
      } else {
        toast.warning(t('i693.tb_flag_inconclusive', { result: result.classification }))
      }
    } catch (e) {
      setTbFlag(null)
      toast.error(e instanceof Error ? e.message : t('i693.tb_flag_failed'))
    } finally {
      setTbFlagLoading(false)
    }
  }, [encounterId, t])

  const handleTbFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = '' // allow re-picking the same file
      if (!file) return
      const name = file.name.toLowerCase()
      if (file.type.toLowerCase() !== 'application/pdf' && !name.endsWith('.pdf')) {
        toast.error(t('i693.tb_flag_pdf_only'))
        return
      }
      setTbFileName(file.name)
      void flagTb(file)
    },
    [flagTb, t]
  )

  const tbFlagTitle = useMemo(() => {
    if (!tbFlag) return t('i693.tb_flag_hint')
    const { values } = tbFlag
    const lines = [
      `${tbFlag.classification} — ${Math.round(tbFlag.confidence * 100)}% ${t('i693.tb_confidence')}`,
      `Nil ${formatTbValue(values.nil)} · TB1-Nil ${formatTbValue(values.tb1_nil)} · TB2-Nil ${formatTbValue(
        values.tb2_nil
      )} · Mitogen-Nil ${formatTbValue(values.mitogen_nil)}`,
      ...(tbFlag.reasons ?? []),
    ]
    if (tbFlag.borderline) lines.push(t('i693.tb_borderline'))
    if (tbFlag.document?.file_name) lines.push(tbFlag.document.file_name)
    return lines.join('\n')
  }, [tbFlag, t])

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
      const nextPageHosts: PagePortalHost[] = []
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
        patchForceEditableAnnotations(annotationsList)
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
        unlockForceEditablePdfWidgets(formLayerDiv)
        if (pageNum > 1) {
          syncApplicantHeaderMirrorDom(formLayerDiv, data, { continuationPage: true })
          fitPdfFormLayerFonts(formLayerDiv)
        }
        const handleFormLayerEdit = (event: Event) => {
          if (isTextFormWidget(event.target)) fitPdfFormWidgetFont(event.target)
          if (
            event.type === 'change' &&
            event.target instanceof HTMLInputElement &&
            event.target.type === 'checkbox' &&
            event.target.checked &&
            pdfRef.current
          ) {
            const short = widgetShortName(event.target.name || '')
            const idx = widgetFieldIndex(event.target.name || '')
            void enforceSingleSelectMarkGroup(pdfRef.current, short, idx).then(() =>
              syncFormFromPdf()
            )
            return
          }
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
          pageBoxEl: pageBox,
        })
      }

      setCombPlacements(nextCombPlacements)
      setPageHosts(nextPageHosts)
      pageHostsRef.current = nextPageHosts
      setPdfReady(true)
    },
    [syncFormFromPdf, t]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        await loadForm()
        await loadLocationAutofillMeta()
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
  }, [loadForm, loadLocationAutofillMeta])

  useEffect(() => {
    if (editorTick === 0) return
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
      pageHostsRef.current = []
      setPageHosts([])
      setCombPlacements([])
      setPdfReady(false)
    }
  }, [editorTick, renderEditorPdf])

  const printI693 = useCallback(
    async (targetWindow?: Window | null) => {
      setPrinting(true)
      try {
        const ok = await saveCurrent(false)
        if (!ok) {
          if (targetWindow && !targetWindow.closed) targetWindow.close()
          return
        }
        const bytes = await fetchFilledPdfBytes()
        const title = `I-693${patientName ? ` — ${patientName}` : ''} (Encounter ${encounterId})`
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
        const opened = printPdfBlob(blob, title, targetWindow)
        if (!opened) {
          if (targetWindow && !targetWindow.closed) targetWindow.close()
          toast.error(t('patient_file.print_popup_blocked'))
        }
      } catch (e) {
        if (targetWindow && !targetWindow.closed) targetWindow.close()
        toast.error(e instanceof Error ? e.message : t('patient_file.print_failed'))
      } finally {
        setPrinting(false)
      }
    },
    [encounterId, fetchFilledPdfBytes, patientName, saveCurrent, t]
  )

  const onPrintClick = useCallback(() => {
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(
        '<!DOCTYPE html><html><head><title>Preparing I-693…</title></head>' +
          '<body style="font-family:sans-serif;color:#444;padding:24px">Preparing I-693 for print…</body></html>'
      )
    }
    void printI693(printWindow)
  }, [printI693])

  const downloadPdf = useCallback(async () => {
    setDownloadLoading(true)
    try {
      const ok = await saveCurrent(false)
      if (!ok) return
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
      setDownloadLoading(false)
    }
  }, [encounterId, fetchFilledPdfBytes, saveCurrent, t])

  const hideSplitView = useCallback(() => {
    setSplitViewOpen(false)
    setSplitDocIndex(null)
  }, [])

  const clampSplitFormRatio = useCallback((ratio: number) => {
    return Math.min(SPLIT_FORM_RATIO_MAX, Math.max(SPLIT_FORM_RATIO_MIN, ratio))
  }, [])

  const onSplitResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      splitDragRef.current = { startX: event.clientX, startRatio: splitFormRatio }
      setSplitResizing(true)
      event.preventDefault()
    },
    [splitFormRatio]
  )

  useEffect(() => {
    if (!splitResizing) return

    const onMove = (event: PointerEvent) => {
      const drag = splitDragRef.current
      const row = splitRowRef.current
      if (!drag || !row) return
      const width = row.getBoundingClientRect().width
      if (width <= SPLIT_SASH_HIT_PX) return
      const deltaRatio = (event.clientX - drag.startX) / width
      setSplitFormRatio(clampSplitFormRatio(drag.startRatio + deltaRatio))
    }

    const onUp = () => {
      splitDragRef.current = null
      setSplitResizing(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [clampSplitFormRatio, splitResizing])

  const resetSplitFormRatio = useCallback(() => {
    setSplitFormRatio(SPLIT_FORM_RATIO_DEFAULT)
  }, [])

  useEffect(() => {
    if (!splitResizing) return
    const prev = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prev
      document.body.style.userSelect = prevSelect
    }
  }, [splitResizing])

  const loadPatientChartDocuments = useCallback(async (): Promise<PatientChartDocumentRef[]> => {
    if (patientId == null) return []
    setPatientChartDocsLoading(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/documents`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) {
        const message = json.error || `${res.status} ${res.statusText}`
        console.error('[loadPatientChartDocuments] Error:', message)
        throw new Error(message)
      }
      const docs = (json.documents ?? []) as PatientChartDocumentRef[]
      const previewable = docs.filter(isPreviewablePatientChartDocument)
      setPatientChartDocs(previewable)
      return previewable
    } catch (e) {
      console.error('[loadPatientChartDocuments] Exception:', e)
      toast.error(e instanceof Error ? e.message : t('i693.splitview_patient_chart_load_failed'))
      setPatientChartDocs([])
      return []
    } finally {
      setPatientChartDocsLoading(false)
    }
  }, [patientId, t])

  const loadLastVisit = useCallback(async () => {
    if (patientId == null) {
      setLastVisitDate(null)
      return
    }
    try {
      const res = await fetch(`/api/patients/${patientId}/encounters`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) return

      const rows = (json.encounters ?? []) as {
        created_at?: string | null
        updated_at?: string | null
        appointments?: { appointment_date?: string | null } | null
      }[]

      // Latest visit across every encounter, including the one being documented, taking the
      // later of the appointment date and the encounter's own activity — the same definition
      // the Patients History "Last visit" column uses, so the two screens agree.
      // Compare on the YYYY-MM-DD prefix since appointment dates carry no timezone.
      let latest: string | null = null
      for (const row of rows) {
        for (const candidate of [
          row.appointments?.appointment_date,
          row.updated_at,
          row.created_at,
        ]) {
          if (!candidate) continue
          if (!latest || candidate.slice(0, 10) > latest.slice(0, 10)) latest = candidate
        }
      }
      setLastVisitDate(latest)
    } catch {
      setLastVisitDate(null)
    }
  }, [patientId])

  useEffect(() => {
    void loadLastVisit()
  }, [loadLastVisit])

  const openSplitView = useCallback(async () => {
    if (patientId != null) {
      await loadPatientChartDocuments()
    }
    setSplitDocIndex(null)
    setSplitViewOpen(true)
  }, [loadPatientChartDocuments, patientId])

  const handleSplitViewSourceChange = useCallback((next: I693SplitViewSource) => {
    setSplitViewSource(next)
    setSplitDocIndex(null)
  }, [])

  const handleSupportingUpload = useCallback((files: File[]) => {
    const previewable = files.filter((file) => {
      const name = file.name.toLowerCase()
      const mime = file.type.toLowerCase()
      return (
        mime === 'application/pdf' ||
        mime.startsWith('image/') ||
        name.endsWith('.pdf') ||
        /\.(png|jpe?g|webp|gif)$/i.test(name)
      )
    })
    if (previewable.length === 0) {
      toast.message(t('i693.splitview_unsupported'))
      return
    }
    setSupportingSplitItems((current) => {
      const start = current.length
      const added = previewable.map((file, index) => localFileToSplitItem(file, start + index))
      setSplitDocIndex((docIdx) => docIdx ?? start)
      return [...current, ...added]
    })
    setSplitViewSource('supporting')
    setSplitViewOpen(true)
  }, [t])

  const removeSupportingSplitItem = useCallback((index: number) => {
    setSupportingSplitItems((current) => current.filter((_, i) => i !== index))
    setSplitDocIndex((current) => {
      if (current == null) return null
      if (current === index) return null
      if (current > index) return current - 1
      return current
    })
  }, [])

  const saveSupportingSplitItem = useCallback(async (index: number) => {
    if (!patientId) return
    const item = supportingSplitItems[index]
    if (!item?.file) return

    const formData = new FormData()
    formData.append('file', item.file)
    formData.append('document_label', 'other')
    formData.append('document_name', item.file.name)

    const loadingId = toast.loading(t('i693.splitview_loading'))

    try {
      const res = await fetch(`/api/patients/${patientId}/documents`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      
      toast.success('Saved to patient file', { id: loadingId })
      setSupportingSplitItems((current) => {
        const next = [...current]
        if (next[index]) next[index].saved = true
        return next
      })
      void loadPatientChartDocuments()
    } catch (e) {
      toast.error('Failed to save document', { id: loadingId })
    }
  }, [patientId, supportingSplitItems, t, loadPatientChartDocuments])

  const splitViewItems = useMemo(() => {
    if (splitViewSource === 'supporting') return supportingSplitItems
    return patientChartDocs.map(patientChartDocToSplitItem)
  }, [patientChartDocs, splitViewSource, supportingSplitItems])

  const splitViewEmptyHint = useMemo(() => {
    if (splitViewSource === 'supporting') return t('i693.splitview_pick_hint_supporting')
    if (patientChartDocs.length === 0) return t('i693.splitview_patient_chart_empty')
    return t('i693.splitview_pick_hint')
  }, [patientChartDocs.length, splitViewSource, t])

  const charCellPortals = useMemo(() => {
    if (combPlacements.length === 0) return null

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
  }, [combPlacements, form, pageHosts, updateCombField])

  const clinicLocationLabel = useMemo(() => {
    if (!locationAutofill) return null
    const parts = [
      locationAutofill.region_label,
      locationAutofill.location_title,
      locationAutofill.location_address,
    ]
      .map((s) => s?.trim())
      .filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : null
  }, [locationAutofill])

  const displayPatientName = useMemo(() => {
    if (patientName?.trim()) return patientName.trim()
    const { family_name, given_name, middle_name } = form.applicant
    const parts = [given_name, middle_name, family_name].map((s) => s?.trim()).filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : null
  }, [form.applicant, patientName])

  const displayDate = useMemo(() => {
    const examDate = form.civil_surgeon?.date_signed || form.applicant_contact?.applicant_signature_date
    const dateStr = examDate || lastVisitDate
    if (!dateStr) return null

    const isIso = /^\d{4}-\d{2}-\d{2}/.test(dateStr)
    return isIso ? formatCalendarDate(dateStr, 'en-US', { month: 'short' }) : dateStr
  }, [form.civil_surgeon?.date_signed, form.applicant_contact?.applicant_signature_date, lastVisitDate])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message={t('i693.pdf_editor_loading')} variant="light" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-3 overflow-x-hidden text-slate-900">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 backdrop-blur-md px-3 py-2 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <>
              <button
                type="button"
                onClick={onBack}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                aria-label={t('i693.back_to_workflow')}
                title={`${t('i693.pdf_editor_title_short')}${patientName ? ` · ${patientName}` : ''} · #${encounterId}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="hidden sm:block h-6 w-px bg-slate-200" aria-hidden />
            </>
          ) : null}
          <div className="min-w-0 flex-1 flex flex-wrap sm:flex-nowrap justify-between items-start gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 truncate leading-tight">{t('i693.immigration_heading')}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 min-w-0">
                {displayPatientName ? (
                  <div className="flex items-center gap-1.5 shrink-0" title={displayPatientName}>
                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-medium text-slate-700">{displayPatientName}</span>
                  </div>
                ) : null}
                {displayDate ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{displayDate}</span>
                  </div>
                ) : null}
                {clinicLocationLabel ? (
                  <div className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{clinicLocationLabel}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {locationAutofill ? (
            <button
              type="button"
              onClick={() => void applyLocationAutofill()}
              disabled={locationAutofillLoading || saving || printing || !locationAutofill.available}
              title={locationAutofill.available ? t('i693.location_autofill_hint') : locationAutofill.reason ?? t('i693.location_autofill_unavailable')}
              className="inline-flex items-center rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {locationAutofillLoading ? t('common.loading') : t('i693.location_autofill_button')}
            </button>
          ) : null}
          
          <button
            type="button"
            onClick={() => void aiFillFromChart()}
            disabled={aiChartLoading || saving || printing}
            title={t('i693.ai_fill_hint')}
            className="inline-flex items-center rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {aiChartLoading ? t('i693.ai_running') : t('i693.ai_fill')}
          </button>
          
          <button
            type="button"
            onClick={() => void openSplitView()}
            disabled={patientChartDocsLoading || saving || printing}
            title={t('i693.splitview_hint')}
            className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 transition-colors shadow-sm"
          >
            {patientChartDocsLoading ? t('i693.splitview_patient_chart_loading') : t('i693.splitview_btn')}
            {(patientChartDocs.length > 0 || supportingSplitItems.length > 0) && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white">
                {Math.max(patientChartDocs.length, supportingSplitItems.length)}
              </span>
            )}
          </button>
          
          <input
            ref={tbFileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleTbFileSelected}
          />
          <button
            type="button"
            onClick={() => tbFileInputRef.current?.click()}
            disabled={tbFlagLoading || saving || printing}
            title={tbFlagTitle}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50 transition-colors shadow-sm ${
              tbFlag
                ? TB_FLAG_STYLES[tbFlag.classification]
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {!tbFlagLoading && !tbFlag && (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48" />
              </svg>
            )}
            {tbFlagLoading
              ? t('i693.tb_flag_running')
              : tbFlag
                ? `${t('i693.tb_flag')}: ${tbFlag.classification}`
                : t('i693.tb_flag')}
          </button>
          {tbFileName && (
            <span className="max-w-[6rem] truncate text-[10px] text-slate-400" title={tbFileName}>
              {tbFileName}
            </span>
          )}

          <div className="hidden sm:block h-5 w-px bg-slate-200 mx-1" aria-hidden />

          {(saving || printing || downloadLoading) && (
            <LoadingSpinner
              compact
              size="xs"
              message={
                printing
                  ? t('i693.pdf_printing')
                  : downloadLoading
                    ? t('i693.pdf_running')
                    : t('i693.pdf_saving_editor')
              }
            />
          )}
          
          <button
            type="button"
            onClick={() => void saveCurrent(true)}
            disabled={!dirty || saving || printing || downloadLoading || !pdfReady}
            title={dirty ? t('common.save') : t('i693.nothing_to_save')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? t('common.saving') : t('common.save')}
            {dirty && !saving ? (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]" aria-hidden="true" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={onPrintClick}
            disabled={printing || saving || downloadLoading || !pdfReady}
            className="inline-flex items-center rounded-lg bg-[#2E6EF3] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#1f5ad2] disabled:opacity-50 transition-colors shadow-sm"
          >
            {printing ? t('i693.pdf_printing') : t('common.print')}
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={printing || saving || downloadLoading || !pdfReady}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
          >
            {downloadLoading ? t('i693.pdf_running') : t('i693.download_pdf')}
          </button>
          
          <div className="hidden sm:block h-5 w-px bg-slate-200 mx-1" aria-hidden />
          <ImmigrationWorkflowStatusBadge caseRow={workflowCase} loading={workflowCaseLoading} />
        </div>
      </div>

      <div
        ref={splitRowRef}
        className={`w-full min-w-0 max-w-full overflow-hidden ${
          splitViewOpen
            ? `flex flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-0 ${
                splitResizing ? 'select-none' : ''
              }`
            : ''
        }`}
        style={
          splitViewOpen
            ? ({
                ['--i693-split-form' as string]: `${splitFormRatio * 100}%`,
                ['--i693-split-doc-min' as string]: `${(1 - SPLIT_FORM_RATIO_MAX) * 100}%`,
              } as CSSProperties)
            : undefined
        }
      >
        <div
          className={`min-w-0 space-y-3 ${
            splitViewOpen
              ? `w-full xl:w-[var(--i693-split-form)] xl:max-w-[var(--i693-split-form)] xl:shrink-0 ${
                  splitResizing ? 'pointer-events-none' : ''
                }`
              : ''
          }`}
        >
          <div className="relative bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden max-h-[calc(100vh-10rem)]">
            {!pdfReady ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
                <LoadingSpinner
                  message={
                    saving ? t('i693.pdf_saving_editor') : t('i693.pdf_editor_loading')
                  }
                  variant="light"
                />
              </div>
            ) : null}
            <div
              ref={editorHostRef}
              className="i693-pdfjs-editor min-h-[480px] p-4 md:p-6 overflow-auto max-h-[calc(100vh-10rem)] [&_.annotationLayer]:pointer-events-auto [&_.annotationLayer_input]:text-slate-900 [&_.annotationLayer_input]:bg-white/90 [&_.annotationLayer_input[data-i693-force-editable=true]]:cursor-text"
            />
            {charCellPortals}
          </div>
        </div>

        {splitViewOpen ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('i693.splitview_resize')}
              aria-valuemin={Math.round(SPLIT_FORM_RATIO_MIN * 100)}
              aria-valuemax={Math.round(SPLIT_FORM_RATIO_MAX * 100)}
              aria-valuenow={Math.round(splitFormRatio * 100)}
              tabIndex={0}
              title={t('i693.splitview_resize_hint')}
              className={`group relative hidden shrink-0 touch-none xl:flex xl:items-stretch xl:cursor-col-resize xl:focus-visible:outline xl:focus-visible:outline-2 xl:focus-visible:outline-offset-0 xl:focus-visible:outline-violet-400 ${
                splitResizing ? 'z-30' : 'z-10'
              }`}
              style={{ width: SPLIT_SASH_WIDTH_PX }}
              onPointerDown={onSplitResizePointerDown}
              onDoubleClick={resetSplitFormRatio}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  setSplitFormRatio((r) => clampSplitFormRatio(r - 0.02))
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  setSplitFormRatio((r) => clampSplitFormRatio(r + 0.02))
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  setSplitFormRatio(SPLIT_FORM_RATIO_MIN)
                } else if (event.key === 'End') {
                  event.preventDefault()
                  setSplitFormRatio(SPLIT_FORM_RATIO_MAX)
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  resetSplitFormRatio()
                }
              }}
            >
              <div
                className="absolute inset-y-0 cursor-col-resize"
                style={{
                  left: -(SPLIT_SASH_HIT_PX - SPLIT_SASH_WIDTH_PX) / 2,
                  width: SPLIT_SASH_HIT_PX,
                }}
                aria-hidden
              />
              <span
                className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
                  splitResizing
                    ? 'bg-violet-500'
                    : 'bg-slate-300 group-hover:bg-violet-400 group-focus-visible:bg-violet-400'
                }`}
                aria-hidden
              />
              {splitResizing ? (
                <span
                  className="pointer-events-none fixed inset-0 z-20 cursor-col-resize"
                  aria-hidden
                />
              ) : null}
            </div>
            <div
              className={`flex min-h-[calc(100vh-10rem)] w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden xl:min-w-[var(--i693-split-doc-min)] ${
                splitResizing ? 'pointer-events-none' : ''
              }`}
            >
              <I693SplitView
                items={splitViewItems}
                activeIndex={splitDocIndex}
                onActiveIndexChange={setSplitDocIndex}
                onClosePanel={hideSplitView}
                source={splitViewSource}
                onSourceChange={handleSplitViewSourceChange}
                showSourceToggle
                allowUpload={splitViewSource === 'supporting'}
                onFilesSelected={handleSupportingUpload}
                removable={splitViewSource === 'supporting'}
                onSaveDocument={splitViewSource === 'supporting' ? saveSupportingSplitItem : undefined}
                onRemoveDocument={removeSupportingSplitItem}
                emptyHint={splitViewEmptyHint}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
