import type { PDFDocumentProxy } from 'pdfjs-dist'

/** Copy PDF bytes so pdf.js can transfer the buffer to its worker without breaking reuse. */
export function clonePdfBytes(data: Uint8Array): Uint8Array {
  return data.slice()
}

function isPasswordRelatedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const o = err as { name?: string; code?: number; message?: string }
  if (o.name === 'PasswordException') return true
  const msg = (o.message ?? '').toLowerCase()
  return msg.includes('password') || msg.includes('encrypt')
}

/** Open PDF bytes in pdf.js (expects server-normalized, unencrypted exports). */
export async function loadPdfJsDocument(
  pdfjs: typeof import('pdfjs-dist'),
  data: Uint8Array
): Promise<PDFDocumentProxy> {
  const load = (password?: string) => {
    const params: { data: Uint8Array; password?: string } = { data: clonePdfBytes(data) }
    if (password !== undefined) params.password = password
    return pdfjs.getDocument(params).promise
  }

  const attempts: (string | undefined)[] = [undefined, '']

  let lastErr: unknown
  for (const password of attempts) {
    try {
      return await load(password)
    } catch (err: unknown) {
      lastErr = err
      if (!isPasswordRelatedError(err)) throw err
    }
  }

  const detail = lastErr instanceof Error ? lastErr.message : 'Unknown PDF load error'
  throw new Error(
    `PDF preview could not open this file (${detail}). Save the form and try Preview again.`
  )
}
