export type I693SplitViewItem = {
  key: string
  name: string
  file?: File
  url?: string
  mimeType?: string
}

export type I693SplitViewSource = 'supporting' | 'patient_chart'

export type PatientChartDocumentRef = {
  id: string
  document_name: string
  file_name?: string
  file_url: string
  file_type?: string
}

function normalizedMime(value?: string): string {
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

export function isSplitViewPdf(item: I693SplitViewItem): boolean {
  const mime = normalizedMime(item.mimeType || item.file?.type)
  const name = item.name.toLowerCase()
  return mime === 'application/pdf' || name.endsWith('.pdf')
}

export function isSplitViewImage(item: I693SplitViewItem): boolean {
  const mime = normalizedMime(item.mimeType || item.file?.type)
  const name = item.name.toLowerCase()
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)
}

export function isPreviewablePatientChartDocument(doc: {
  file_url?: string
  file_type?: string
  file_name?: string
  document_name?: string
}): boolean {
  if (!doc.file_url?.trim()) return false
  const mime = normalizedMime(doc.file_type)
  const name = (doc.file_name ?? doc.document_name ?? '').toLowerCase()
  return (
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    name.endsWith('.pdf') ||
    /\.(png|jpe?g|webp|gif)$/i.test(name)
  )
}

export function patientChartDocToSplitItem(doc: PatientChartDocumentRef): I693SplitViewItem {
  return {
    key: `patient-doc-${doc.id}`,
    name: doc.document_name || doc.file_name || 'Document',
    url: doc.file_url,
    mimeType: doc.file_type,
  }
}

export function localFileToSplitItem(file: File, index: number): I693SplitViewItem {
  return {
    key: `local-${file.name}-${file.size}-${index}`,
    name: file.name,
    file,
    mimeType: file.type,
  }
}

export async function readSplitViewBytes(item: I693SplitViewItem): Promise<Uint8Array> {
  if (item.file) {
    return new Uint8Array(await item.file.arrayBuffer())
  }
  if (!item.url) {
    throw new Error('Document has no file content')
  }
  const res = await fetch(item.url)
  if (!res.ok) {
    throw new Error(`Could not load document (${res.status})`)
  }
  return new Uint8Array(await res.arrayBuffer())
}
