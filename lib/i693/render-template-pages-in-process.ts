import { readFile } from 'node:fs/promises'

const PDF_PT_WIDTH = 612
const PDF_PT_HEIGHT = 792

export type TemplatePageRenderResult = {
  pageCount: number
  pageWidth: number
  pageHeight: number
  scale: number
  /** PNG bytes per page index */
  pages: Uint8Array[]
}

/** Render blank USCIS template pages as PNG (MuPDF, Node only). */
export async function renderTemplatePagesInProcess(
  templatePath: string,
  scale = 1.25
): Promise<TemplatePageRenderResult> {
  const mupdf = await import(/* webpackIgnore: true */ 'mupdf')
  const srcDoc = mupdf.Document.openDocument(templatePath)
  const pageCount = srcDoc.countPages()
  const pages: Uint8Array[] = []

  for (let i = 0; i < pageCount; i++) {
    const page = srcDoc.loadPage(i)
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true
    )
    pages.push(new Uint8Array(pixmap.asPNG()))
  }

  return {
    pageCount,
    pageWidth: PDF_PT_WIDTH,
    pageHeight: PDF_PT_HEIGHT,
    scale,
    pages,
  }
}

export async function renderTemplatePageInProcess(
  templatePath: string,
  pageIndex: number,
  scale = 1.25
): Promise<Uint8Array> {
  const mupdf = await import(/* webpackIgnore: true */ 'mupdf')
  const srcDoc = mupdf.Document.openDocument(templatePath)
  const page = srcDoc.loadPage(pageIndex)
  const pixmap = page.toPixmap(
    mupdf.Matrix.scale(scale, scale),
    mupdf.ColorSpace.DeviceRGB,
    false,
    true
  )
  return new Uint8Array(pixmap.asPNG())
}

export async function getTemplatePageCount(templatePath: string): Promise<number> {
  try {
    const mupdf = await import(/* webpackIgnore: true */ 'mupdf')
    const srcDoc = mupdf.Document.openDocument(templatePath)
    return srcDoc.countPages()
  } catch {
    const raw = await readFile(templatePath)
    const { PDFDocument } = await import('pdf-lib')
    try {
      const doc = await PDFDocument.load(new Uint8Array(raw), { ignoreEncryption: true })
      return doc.getPageCount()
    } catch {
      return 14
    }
  }
}
