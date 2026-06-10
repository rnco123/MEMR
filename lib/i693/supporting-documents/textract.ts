import {
  DetectDocumentTextCommand,
  TextractClient,
  type Block,
  type DetectDocumentTextCommandOutput,
} from '@aws-sdk/client-textract'

export const I693_TEXTRACT_SYNC_MAX_BYTES = 10 * 1024 * 1024
export const I693_TEXTRACT_SYNC_MAX_PDF_PAGES = 50
const PDF_RENDER_SCALE = 2

export type TextractDocumentText = {
  fileName: string
  text: string
  pages: number
  lineCount: number
  averageConfidence: number | null
}

export type TextractClientLike = {
  send: (command: DetectDocumentTextCommand) => Promise<DetectDocumentTextCommandOutput>
}

export class I693TextractDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'I693TextractDocumentError'
  }
}

export class I693TextractConfigError extends Error {
  constructor(
    message = 'AWS Textract is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env (see .env.example).'
  ) {
    super(message)
    this.name = 'I693TextractConfigError'
  }
}

function textractRegion(): string {
  return process.env.AWS_TEXTRACT_REGION?.trim() || process.env.AWS_REGION?.trim() || 'us-east-1'
}

function textractCredentials():
  | { accessKeyId: string; secretAccessKey: string }
  | undefined {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) return undefined
  return { accessKeyId, secretAccessKey }
}

export function isI693TextractConfigured(): boolean {
  return textractCredentials() != null
}

/** Fail fast before OCR when AWS keys are missing from the server environment. */
export function assertI693TextractConfigured(): void {
  if (!isI693TextractConfigured()) {
    throw new I693TextractConfigError()
  }
}

export function createI693TextractClient(): TextractClient {
  const credentials = textractCredentials()
  if (!credentials) {
    throw new I693TextractConfigError()
  }
  return new TextractClient({
    region: textractRegion(),
    credentials,
  })
}

function isCredentialsProviderError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'name' in error &&
    (error as { name?: string }).name === 'CredentialsProviderError'
  )
}

function blockPage(block: Block): number {
  return block.Page ?? 1
}

function blockTop(block: Block): number {
  return block.Geometry?.BoundingBox?.Top ?? 0
}

function blockLeft(block: Block): number {
  return block.Geometry?.BoundingBox?.Left ?? 0
}

export function textractBlocksToText(blocks: Block[] | undefined): {
  text: string
  lineCount: number
  averageConfidence: number | null
} {
  const lines = (blocks ?? [])
    .filter((block) => block.BlockType === 'LINE' && block.Text?.trim())
    .sort((a, b) => (
      blockPage(a) - blockPage(b) ||
      blockTop(a) - blockTop(b) ||
      blockLeft(a) - blockLeft(b)
    ))

  const confidences = lines
    .map((line) => line.Confidence)
    .filter((confidence): confidence is number => typeof confidence === 'number')

  const averageConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length
      : null

  return {
    text: lines.map((line) => line.Text!.trim()).join('\n'),
    lineCount: lines.length,
    averageConfidence,
  }
}

function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
}

async function renderPdfPagesToPng(bytes: Uint8Array, fileName: string): Promise<Uint8Array[]> {
  try {
    const mupdf = await import(/* webpackIgnore: true */ 'mupdf')
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
    const pageCount = doc.countPages()
    if (pageCount > I693_TEXTRACT_SYNC_MAX_PDF_PAGES) {
      throw new I693TextractDocumentError(
        `${fileName} has ${pageCount} pages. Upload PDFs with ${I693_TEXTRACT_SYNC_MAX_PDF_PAGES} pages or fewer for this synchronous OCR review.`
      )
    }

    const pages: Uint8Array[] = []
    for (let index = 0; index < pageCount; index++) {
      const page = doc.loadPage(index)
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(PDF_RENDER_SCALE, PDF_RENDER_SCALE),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true
      )
      pages.push(new Uint8Array(pixmap.asPNG()))
    }
    return pages
  } catch (error) {
    if (error instanceof I693TextractDocumentError) throw error
    throw new I693TextractDocumentError(
      `${fileName} could not be rendered for Textract OCR. It may be encrypted, XFA-based, damaged, or otherwise unsupported.`
    )
  }
}

function isUnsupportedTextractError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; __type?: string; message?: string }
  return (
    err.name === 'UnsupportedDocumentException' ||
    err.__type === 'UnsupportedDocumentException' ||
    Boolean(err.message?.includes('UnsupportedDocumentException'))
  )
}

function isBadTextractDocumentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; __type?: string; message?: string }
  return (
    err.name === 'BadDocumentException' ||
    err.__type === 'BadDocumentException' ||
    Boolean(err.message?.includes('BadDocumentException'))
  )
}

function isTooLargeTextractDocumentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; __type?: string; message?: string }
  return (
    err.name === 'DocumentTooLargeException' ||
    err.__type === 'DocumentTooLargeException' ||
    Boolean(err.message?.includes('DocumentTooLargeException'))
  )
}

async function detectTextFromBytes(
  client: TextractClientLike,
  bytes: Uint8Array,
  fileName: string
): Promise<ReturnType<typeof textractBlocksToText>> {
  try {
    const response = await client.send(
      new DetectDocumentTextCommand({
        Document: {
          Bytes: bytes,
        },
      })
    )
    return textractBlocksToText(response.Blocks)
  } catch (error) {
    if (isUnsupportedTextractError(error) || isBadTextractDocumentError(error)) {
      throw new I693TextractDocumentError(
        `${fileName} is not supported by Textract OCR. For synchronous OCR, PDFs must be renderable, non-XFA, not password protected, and each rendered page must be a supported image.`
      )
    }
    if (isTooLargeTextractDocumentError(error)) {
      throw new I693TextractDocumentError(
        `${fileName} is too large for synchronous Textract OCR after rendering.`
      )
    }
    if (isCredentialsProviderError(error)) {
      throw new I693TextractConfigError()
    }
    throw error
  }
}

function combinePageText(
  fileName: string,
  pages: Array<{ pageNumber: number; text: string; lineCount: number; averageConfidence: number | null }>
): TextractDocumentText {
  const lineCount = pages.reduce((sum, page) => sum + page.lineCount, 0)
  const weightedConfidence = pages.reduce((sum, page) => (
    page.averageConfidence == null ? sum : sum + page.averageConfidence * page.lineCount
  ), 0)

  return {
    fileName,
    text: pages
      .map((page) => `[Page ${page.pageNumber}]\n${page.text}`.trim())
      .filter(Boolean)
      .join('\n\n'),
    pages: pages.length,
    lineCount,
    averageConfidence: lineCount > 0 ? weightedConfidence / lineCount : null,
  }
}

export async function extractTextFromI693SupportingPdf(
  file: File,
  client: TextractClientLike = createI693TextractClient()
): Promise<TextractDocumentText> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isPdfBytes(bytes)) {
    const renderedPages = await renderPdfPagesToPng(bytes, file.name)
    const pageResults = []
    for (let index = 0; index < renderedPages.length; index++) {
      const extracted = await detectTextFromBytes(client, renderedPages[index]!, file.name)
      pageResults.push({
        pageNumber: index + 1,
        text: extracted.text,
        lineCount: extracted.lineCount,
        averageConfidence: extracted.averageConfidence,
      })
    }
    return combinePageText(file.name, pageResults)
  }

  if (file.size > I693_TEXTRACT_SYNC_MAX_BYTES) {
    throw new I693TextractDocumentError(
      `Textract synchronous OCR supports image files up to ${I693_TEXTRACT_SYNC_MAX_BYTES / 1024 / 1024}MB in this flow.`
    )
  }

  const extracted = await detectTextFromBytes(client, bytes, file.name)
  return {
    fileName: file.name,
    text: extracted.text,
    pages: 1,
    lineCount: extracted.lineCount,
    averageConfidence: extracted.averageConfidence,
  }
}

export async function extractTextFromI693SupportingPdfs(
  files: File[],
  client: TextractClientLike = createI693TextractClient()
): Promise<TextractDocumentText[]> {
  const out: TextractDocumentText[] = []
  for (const file of files) {
    out.push(await extractTextFromI693SupportingPdf(file, client))
  }
  return out
}
