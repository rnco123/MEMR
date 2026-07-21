import type { PDFPageProxy } from 'pdfjs-dist'
import { loadPdfJsDocument } from '@/lib/i693/pdfjs-load'

/** Base CSS-pixel scale for chart PDFs in split view (before devicePixelRatio). */
export const CHART_PDF_VIEW_SCALE = 1.75

/** Base CSS-pixel scale for patient-file PDF modal (before devicePixelRatio). */
export const PATIENT_FILE_PDF_VIEW_SCALE = 1.5

export function pdfCanvasPixelRatio(): number {
  if (typeof window === 'undefined') return 1
  return Math.min(window.devicePixelRatio || 1, 3)
}

/**
 * Render a PDF page to a canvas at crisp resolution on HiDPI displays.
 * Sets canvas CSS dimensions to logical (CSS) size while backing store uses pixelRatio.
 */
export async function renderPdfPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssScale: number
): Promise<{ width: number; height: number }> {
  const pixelRatio = pdfCanvasPixelRatio()
  const viewport = page.getViewport({ scale: cssScale * pixelRatio })
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not acquire canvas 2D context')
  }

  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / pixelRatio}px`
  canvas.style.height = `${viewport.height / pixelRatio}px`

  await page.render({ canvasContext: context, viewport }).promise

  return {
    width: viewport.width / pixelRatio,
    height: viewport.height / pixelRatio,
  }
}

export async function loadPdfDocumentFromUrl(url: string) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Could not load PDF (${res.status})`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  return loadPdfJsDocument(pdfjs, bytes)
}
