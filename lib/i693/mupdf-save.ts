import { loadMupdf } from '@/lib/i693/mupdf-template'

type MupdfSaveBuffer = {
  asUint8Array?: () => Uint8Array
  constructor?: { name?: string }
}

type MupdfPdfDoc = {
  needsPassword?: () => boolean
  authenticatePassword?: (password: string) => number
  saveToBuffer: (opts: { compress: boolean }) => Uint8Array | MupdfSaveBuffer
}

export function mupdfBufferToBytes(buf: Uint8Array | MupdfSaveBuffer): Uint8Array {
  if (buf instanceof Uint8Array) {
    return new Uint8Array(buf)
  }
  if (typeof buf.asUint8Array === 'function') {
    return new Uint8Array(buf.asUint8Array())
  }
  const typeName = buf?.constructor?.name ?? typeof buf
  throw new Error(`Unsupported MuPDF saveToBuffer() result: ${typeName}`)
}

/** Re-save PDF bytes with MuPDF so encryption metadata is dropped for pdf.js preview. */
export async function rewritePdfWithMupdf(bytes: Uint8Array): Promise<Uint8Array> {
  const mupdf = await loadMupdf()
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf') as unknown as MupdfPdfDoc

  if (doc.needsPassword?.()) {
    let authed = false
    for (const pwd of ['', ' ']) {
      if ((doc.authenticatePassword?.(pwd) ?? 0) !== 0) {
        authed = true
        break
      }
    }
    if (!authed) {
      throw new Error('PDF is password-protected and could not be decrypted for preview.')
    }
  }

  return mupdfBufferToBytes(doc.saveToBuffer({ compress: true }))
}
