import { loadMupdf, openI693Pdf } from '@/lib/i693/mupdf-template'

export type I693PdfValidationReport = {
  pdfValid: true
  pageCount: number
  widgetCount: number
  filledFields: number
  missingFields: number
}

export function assertPdfBytes(bytes: Uint8Array): void {
  const header = new TextDecoder().decode(bytes.slice(0, 8))
  if (!header.startsWith('%PDF-')) {
    throw new Error(`Invalid PDF generated. Header was: ${JSON.stringify(header)}`)
  }
}

function widgetHasValue(widget: {
  getValue?: () => unknown
}): boolean {
  try {
    const value = widget.getValue?.()
    if (value == null) return false
    const text = String(value).trim()
    return text.length > 0 && text !== 'Off'
  } catch {
    return false
  }
}

type MupdfWidgetPage = {
  getWidgets: () => { getValue?: () => unknown }[]
}

export async function validateI693PdfExport(
  bytes: Uint8Array,
  options: {
    templatePath?: string
    expectedFilledFields?: number
  } = {}
): Promise<I693PdfValidationReport> {
  assertPdfBytes(bytes)

  const mupdf = await loadMupdf()
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pageCount = doc.countPages()

  if (options.templatePath) {
    const template = await openI693Pdf(options.templatePath)
    const expectedPageCount = template.countPages()
    if (pageCount !== expectedPageCount) {
      throw new Error(
        `Invalid I-693 PDF export. Expected ${expectedPageCount} pages, generated ${pageCount}.`
      )
    }
  }

  let widgetCount = 0
  let filledWidgetValues = 0

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = doc.loadPage(pageIndex) as MupdfWidgetPage
    const widgets = page.getWidgets()
    widgetCount += widgets.length
    for (const widget of widgets) {
      if (widgetHasValue(widget)) filledWidgetValues++
    }
  }

  if (widgetCount === 0) {
    throw new Error('Invalid I-693 PDF export. Generated PDF has no widgets.')
  }

  const expectedFilledFields = options.expectedFilledFields ?? 0
  if (expectedFilledFields > 0 && filledWidgetValues === 0) {
    throw new Error(
      `Invalid I-693 PDF export. Expected filled fields, but no widget values were readable.`
    )
  }

  return {
    pdfValid: true,
    pageCount,
    widgetCount,
    filledFields: filledWidgetValues,
    missingFields: Math.max(0, expectedFilledFields - filledWidgetValues),
  }
}
