import type { I693Annotation } from '@/lib/i693/annotations'
import { loadMupdf } from '@/lib/i693/mupdf-template'
import { mupdfBufferToBytes } from '@/lib/i693/mupdf-save'

type MupdfPdfDoc = {
  needsPassword?: () => boolean
  authenticatePassword?: (password: string) => number
  loadPage: (index: number) => MupdfPdfPage
  saveToBuffer: (opts: { compress: boolean }) => Uint8Array | { asUint8Array?: () => Uint8Array }
}

type MupdfPdfPage = {
  getBounds: () => [number, number, number, number]
  createAnnotation: (type: string) => MupdfPdfAnnot
}

type AnnotColor = [] | [number] | [number, number, number] | [number, number, number, number]

type MupdfImage = unknown

type MupdfPdfAnnot = {
  setRect: (rect: [number, number, number, number]) => void
  setContents: (text: string) => void
  setDefaultAppearance: (fontName: string, size: number, color: AnnotColor) => void
  setLine: (a: [number, number], b: [number, number]) => void
  setColor: (color: AnnotColor) => void
  setInkList: (strokes: [number, number][][]) => void
  setStampImage: (image: MupdfImage) => void
  setFlags: (flags: number) => void
  update: () => void
}

function decodeImageDataUrl(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/.exec(dataUrl)
  if (!m || !m[1]) return null
  try {
    return Uint8Array.from(Buffer.from(m[1], 'base64'))
  } catch {
    return null
  }
}

function pageBox(page: MupdfPdfPage): {
  ox: number
  oy: number
  pageW: number
  pageH: number
} {
  const b = page.getBounds()
  return { ox: b[0], oy: b[1], pageW: b[2] - b[0], pageH: b[3] - b[1] }
}

const FONT_SIZE = 10

/** Bake overlays with MuPDF so they survive export (pdf-lib draw is unreliable on this template). */
export async function bakeI693AnnotationsOnPdf(
  inputBytes: Uint8Array,
  annotations: I693Annotation[]
): Promise<Uint8Array> {
  if (!annotations.length) return inputBytes

  const mupdf = await loadMupdf()
  const doc = mupdf.Document.openDocument(inputBytes, 'application/pdf') as unknown as MupdfPdfDoc

  if (doc.needsPassword?.()) {
    for (const pwd of ['', ' ']) {
      if ((doc.authenticatePassword?.(pwd) ?? 0) !== 0) break
    }
  }

  const PRINT = mupdf.PDFAnnotation.IS_PRINT

  for (const a of annotations) {
    const page = doc.loadPage(Math.max(0, a.page - 1))
    const { ox, oy, pageW, pageH } = pageBox(page)

    // MuPDF page space uses a top-left origin (y increases downward).
    if (a.type === 'text') {
      const w = Math.max(12, a.widthPercent * pageW)
      const h = Math.max(FONT_SIZE + 2, a.heightPercent * pageH)
      const x0 = ox + a.xPercent * pageW
      const yTop = oy + a.yPercent * pageH
      const yBottom = yTop + h

      const annot = page.createAnnotation('FreeText')
      annot.setRect([x0, yTop, x0 + w, yBottom])
      annot.setContents(a.value || '')
      annot.setDefaultAppearance('Helv', FONT_SIZE, [0, 0, 0])
      annot.setColor([1, 1, 1])
      annot.setFlags(PRINT)
      annot.update()
      continue
    }

    if (a.type === 'cross') {
      // Use Ink annotation (two strokes = two arms of the cross)
      const size = Math.max(6, a.sizePercent * pageW)
      const x0 = ox + a.xPercent * pageW
      const x1 = x0 + size
      const yTop = oy + a.yPercent * pageH
      const yBottom = yTop + size

      const arm1: [number, number][] = [[x0, yTop], [x1, yBottom]]
      const arm2: [number, number][] = [[x0, yBottom], [x1, yTop]]

      // Ink annotations: setRect is not supported — bounds come from the ink list.
      const annot = page.createAnnotation('Ink')
      annot.setInkList([arm1, arm2])
      annot.setColor([0, 0, 0])
      annot.setFlags(PRINT)
      annot.update()
      continue
    }

    if (a.type === 'image') {
      const decoded = decodeImageDataUrl(a.imageUrl)
      if (!decoded) continue
      const w = Math.max(8, a.widthPercent * pageW)
      const h = Math.max(8, a.heightPercent * pageH)
      const x0 = ox + a.xPercent * pageW
      const yTop = oy + a.yPercent * pageH
      const yBottom = yTop + h

      const image = new (mupdf as unknown as { Image: new (data: Uint8Array) => MupdfImage }).Image(
        decoded
      )
      const annot = page.createAnnotation('Stamp')
      annot.setRect([x0, yTop, x0 + w, yBottom])
      annot.setStampImage(image)
      annot.setFlags(PRINT)
      annot.update()
      continue
    }
  }

  return mupdfBufferToBytes(doc.saveToBuffer({ compress: true }))
}
