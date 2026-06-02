/** MuPDF helpers for USCIS I-693 template (Node only). */

export type MupdfModule = typeof import('mupdf')

export async function loadMupdf(): Promise<MupdfModule> {
  return import(/* webpackIgnore: true */ 'mupdf')
}

export async function openI693Pdf(templatePath: string) {
  const mupdf = await loadMupdf()
  return mupdf.Document.openDocument(templatePath) as import('mupdf').PDFDocument
}

export async function countTemplateWidgets(templatePath: string): Promise<number> {
  const doc = await openI693Pdf(templatePath)
  let n = 0
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i)
    n += page.getWidgets().length
  }
  return n
}
