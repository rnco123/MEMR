import { rewritePdfWithMupdf } from '@/lib/i693/mupdf-save'

/** Normalize generated PDFs: MuPDF re-save drops encryption so pdf.js preview can open them. */
export async function ensureViewablePdfBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (!bytes?.length) return bytes
  const header = new TextDecoder().decode(bytes.slice(0, 5))
  if (!header.startsWith('%PDF')) return bytes

  try {
    return await rewritePdfWithMupdf(bytes)
  } catch {
    return bytes
  }
}
