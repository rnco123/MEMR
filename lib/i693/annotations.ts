import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export type I693TextAnnotation = {
  id: string
  page: number
  type: 'text'
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  value: string
}

export type I693CrossAnnotation = {
  id: string
  page: number
  type: 'cross'
  xPercent: number
  yPercent: number
  sizePercent: number
}

export type I693ImageAnnotation = {
  id: string
  page: number
  type: 'image'
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  imageUrl: string
}

export type I693Annotation = I693TextAnnotation | I693CrossAnnotation | I693ImageAnnotation
const DEFAULT_TEXT_FONT_SIZE = 12

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function parseAnnotation(input: unknown): I693Annotation | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.type !== 'string') return null
  const page = asNumber(raw.page)
  const xPercent = asNumber(raw.xPercent)
  const yPercent = asNumber(raw.yPercent)
  if (page == null || xPercent == null || yPercent == null) return null

  if (raw.type === 'text') {
    const widthPercent = asNumber(raw.widthPercent)
    const heightPercent = asNumber(raw.heightPercent)
    if (widthPercent == null || heightPercent == null) return null
    return {
      id: raw.id,
      type: 'text',
      page,
      xPercent: clamp01(xPercent),
      yPercent: clamp01(yPercent),
      widthPercent: clamp01(widthPercent),
      heightPercent: clamp01(heightPercent),
      value: typeof raw.value === 'string' ? raw.value : '',
    }
  }

  if (raw.type === 'cross') {
    const sizePercent = asNumber(raw.sizePercent)
    if (sizePercent == null) return null
    return {
      id: raw.id,
      type: 'cross',
      page,
      xPercent: clamp01(xPercent),
      yPercent: clamp01(yPercent),
      sizePercent: clamp01(sizePercent),
    }
  }

  if (raw.type === 'image') {
    const widthPercent = asNumber(raw.widthPercent)
    const heightPercent = asNumber(raw.heightPercent)
    if (widthPercent == null || heightPercent == null || typeof raw.imageUrl !== 'string') return null
    return {
      id: raw.id,
      type: 'image',
      page,
      xPercent: clamp01(xPercent),
      yPercent: clamp01(yPercent),
      widthPercent: clamp01(widthPercent),
      heightPercent: clamp01(heightPercent),
      imageUrl: raw.imageUrl,
    }
  }

  return null
}

export function parseI693Annotations(input: unknown): I693Annotation[] {
  if (!Array.isArray(input)) return []
  return input.map(parseAnnotation).filter((a): a is I693Annotation => a != null)
}

/** Read overlays from `i693_submissions.annotations` or legacy `form_data.annotation_overlays`. */
export function resolveStoredI693Annotations(
  columnValue: unknown,
  formData?: { annotation_overlays?: unknown } | null
): I693Annotation[] {
  const fromColumn = parseI693Annotations(columnValue)
  if (fromColumn.length > 0) return fromColumn
  return parseI693Annotations(formData?.annotation_overlays)
}

async function embedImageFromDataUrl(pdfDoc: PDFDocument, dataUrl: string) {
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  const mime = (m[1] ?? '').toLowerCase()
  const payload = m[2]
  if (!payload) return null
  const bytes = Uint8Array.from(Buffer.from(payload, 'base64'))
  if (mime === 'image/png') return pdfDoc.embedPng(bytes)
  if (mime === 'image/jpeg' || mime === 'image/jpg') return pdfDoc.embedJpg(bytes)
  return null
}

/** Draws lightweight fallback annotations on top of already-filled PDF bytes. */
export async function drawI693AnnotationsOnPdf(
  inputBytes: Uint8Array,
  annotations: I693Annotation[]
): Promise<Uint8Array> {
  if (!annotations.length) return inputBytes

  const pdfDoc = await PDFDocument.load(inputBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  })
  const pages = pdfDoc.getPages()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const a of annotations) {
    const pageIndex = Math.max(0, a.page - 1)
    const page = pages[pageIndex]
    if (!page) continue
    const { width: pageW, height: pageH } = page.getSize()

    if (a.type === 'text') {
      const x = a.xPercent * pageW
      const topY = a.yPercent * pageH
      const h = a.heightPercent * pageH
      const y = pageH - topY - h + Math.max(0, (h - DEFAULT_TEXT_FONT_SIZE) / 2)
      page.drawText(a.value || '', {
        x,
        y,
        size: DEFAULT_TEXT_FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
        maxWidth: Math.max(8, a.widthPercent * pageW),
      })
      continue
    }

    if (a.type === 'cross') {
      const x = a.xPercent * pageW
      const topY = a.yPercent * pageH
      const size = Math.max(4, a.sizePercent * pageW)
      const yBottom = pageH - topY - size
      const yTop = yBottom + size
      page.drawLine({
        start: { x, y: yBottom },
        end: { x: x + size, y: yTop },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      })
      page.drawLine({
        start: { x, y: yTop },
        end: { x: x + size, y: yBottom },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      })
      continue
    }

    const image = await embedImageFromDataUrl(pdfDoc, a.imageUrl)
    if (!image) continue
    const x = a.xPercent * pageW
    const topY = a.yPercent * pageH
    const w = Math.max(8, a.widthPercent * pageW)
    const h = Math.max(8, a.heightPercent * pageH)
    const y = pageH - topY - h
    page.drawImage(image, { x, y, width: w, height: h })
  }

  return new Uint8Array(
    await pdfDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
      updateFieldAppearances: false,
    })
  )
}
