'use client'

import 'pdfjs-dist/web/pdf_viewer.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { I693FormData } from '@/lib/i693/types'
import { EMPTY_I693_FORM } from '@/lib/i693/types'
import { extractFormDataFromApi, parseFormDataFromApi, countFilledI693Fields } from '@/lib/i693/form-api'
import { I693PdfCharCellField } from '@/components/I693PdfCharCellField'
import { I693SplitView } from '@/components/I693SplitView'
import {
  type PatientChartDocumentRef,
  isPreviewablePatientChartDocument,
  patientChartDocToSplitItem,
} from '@/lib/i693/split-view-document'
import {
  applyI693FormToPdfDocument,
  applyApplicantHeaderMirrors,
  enforceSingleSelectMarkGroup,
  extractI693FormFromPdfDocumentRespectingUserEdits,
  syncApplicantHeaderMirrorDom,
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

const PDF_URL = '/forms/i-693-template.pdf'
const DEFAULT_SCALE = 1.2

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

export function I693PdfFormEditor({ encounterId, patientName, onBack }: Props) {
  const { t } = useT()
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
  const [patientId, setPatientId] = useState<number | null>(null)
  const [patientChartDocs, setPatientChartDocs] = useState<PatientChartDocumentRef[]>([])
  const [patientChartDocsLoading, setPatientChartDocsLoading] = useState(false)
  const [locationAutofill, setLocationAutofill] = useState<I693LocationAutofillMeta | null>(null)
  const [locationAutofillLoading, setLocationAutofillLoading] = useState(false)
  const [aiChartLoading, setAiChartLoading] = useState(false)
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

  const loadPatientChartDocuments = useCallback(async (): Promise<PatientChartDocumentRef[]> => {
    if (patientId == null) return []
    setPatientChartDocsLoading(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/documents`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('i693.splitview_patient_chart_load_failed'))
      const docs = (json.documents ?? []) as PatientChartDocumentRef[]
      const previewable = docs.filter(isPreviewablePatientChartDocument)
      setPatientChartDocs(previewable)
      return previewable
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('i693.splitview_patient_chart_load_failed'))
      setPatientChartDocs([])
      return []
    } finally {
      setPatientChartDocsLoading(false)
    }
  }, [patientId, t])

  const openPatientChartSplitView = useCallback(async () => {
    const docs = patientChartDocs.length > 0 ? patientChartDocs : await loadPatientChartDocuments()
    if (docs.length === 0) {
      toast.message(t('i693.splitview_patient_chart_empty'))
      return
    }
    // Always start on the picker — including when there is only 1 document —
    // so the user explicitly chooses which chart file to open.
    setSplitDocIndex(null)
    setSplitViewOpen(true)
  }, [loadPatientChartDocuments, patientChartDocs, t])

  const splitViewItems = useMemo(
    () => patientChartDocs.map(patientChartDocToSplitItem),
    [patientChartDocs]
  )

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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message={t('i693.pdf_editor_loading')} variant="light" />
      </div>
    )
  }

  return (
    <div className="space-y-3 text-slate-900">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('i693.immigration_heading')}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {displayPatientName || patientId != null ? (
            <span>
              <span className="text-slate-500">{t('i693.selected_patient')}:</span>{' '}
              {displayPatientName ? (
                <span className="font-medium text-slate-900">{displayPatientName}</span>
              ) : null}
              {patientId != null ? (
                <span className="ml-1.5 text-xs text-slate-400">
                  {t('i693.patient_id')} #{patientId}
                </span>
              ) : null}
            </span>
          ) : null}
          <span>
            <span className="text-slate-500">{t('i693.encounter_label')}:</span>{' '}
            <span className="font-medium text-slate-900">#{encounterId}</span>
          </span>
          {clinicLocationLabel ? (
            <span>
              <span className="text-slate-500">{t('i693.clinic_location')}:</span>{' '}
              <span className="font-medium text-slate-900">{clinicLocationLabel}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        {onBack ? (
          <>
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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

        {locationAutofill ? (
          <button
            type="button"
            onClick={() => void applyLocationAutofill()}
            disabled={
              locationAutofillLoading ||
              saving ||
              printing ||
              !locationAutofill.available
            }
            title={
              locationAutofill.available
                ? t('i693.location_autofill_hint')
                : locationAutofill.reason ?? t('i693.location_autofill_unavailable')
            }
            className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {locationAutofillLoading ? t('common.loading') : t('i693.location_autofill_button')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void aiFillFromChart()}
          disabled={aiChartLoading || saving || printing}
          title={t('i693.ai_fill_hint')}
          className="inline-flex items-center rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {aiChartLoading ? t('i693.ai_running') : t('i693.ai_fill')}
        </button>
        <button
          type="button"
          onClick={() => void openPatientChartSplitView()}
          disabled={patientId == null || patientChartDocsLoading || saving || printing}
          title={t('i693.splitview_patient_chart_hint')}
          className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
        >
          {patientChartDocsLoading
            ? t('i693.splitview_patient_chart_loading')
            : t('i693.splitview_patient_chart_btn')}
          {patientChartDocs.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white">
              {patientChartDocs.length}
            </span>
          )}
        </button>

        <div className="flex-1 min-w-2" />

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
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('common.save')}
          {dirty && !saving ? (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          ) : null}
        </button>
        <button
          type="button"
          onClick={onPrintClick}
          disabled={printing || saving || downloadLoading || !pdfReady}
          className="inline-flex items-center rounded-lg bg-[#2E6EF3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1f5ad2] disabled:opacity-50"
        >
          {printing ? t('i693.pdf_printing') : t('common.print')}
        </button>
        <button
          type="button"
          onClick={() => void downloadPdf()}
          disabled={printing || saving || downloadLoading || !pdfReady}
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {downloadLoading ? t('i693.pdf_running') : t('i693.download_pdf')}
        </button>
      </div>

      <div
        className={`grid gap-4 ${
          splitViewOpen ? 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,44%)]' : ''
        }`}
      >
        <div className="min-w-0 space-y-3">
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
              className="i693-pdfjs-editor min-h-[480px] p-4 md:p-6 overflow-auto max-h-[calc(100vh-10rem)] [&_.annotationLayer]:pointer-events-auto [&_.annotationLayer_input]:text-slate-900 [&_.annotationLayer_input]:bg-white/90"
            />
            {charCellPortals}
          </div>
        </div>

        {splitViewOpen && splitViewItems.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-4">
            <I693SplitView
              items={splitViewItems}
              activeIndex={splitDocIndex}
              onActiveIndexChange={setSplitDocIndex}
              onClosePanel={hideSplitView}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
