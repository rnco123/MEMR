import { readFile } from 'fs/promises'
import { normalizePdfCheckboxExport } from '@/lib/i693/pdf-checkbox-utils'
import { widgetFieldIndex } from '@/lib/i693/pdf-widget-map'
import { resolveI693TemplatePath } from '@/lib/i693/generate-pdf'

type FieldEntry = { exportValues?: unknown }

let cached: Map<string, string> | null = null

/** Full PDF field name → checkbox /export value (cached per process). */
export async function loadPdfCheckboxExportMap(
  templatePath?: string | null
): Promise<Map<string, string>> {
  if (cached) return cached

  const path = templatePath ?? (await resolveI693TemplatePath())
  if (!path) {
    cached = new Map()
    return cached
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(path))
  const pdf = await pdfjs.getDocument({ data, verbosity: 0 }).promise
  const fieldObjects = await pdf.getFieldObjects()
  const map = new Map<string, string>()

  for (const [fieldName, entries] of Object.entries(fieldObjects ?? {})) {
    const list = (entries ?? []) as FieldEntry[]
    const idx = widgetFieldIndex(fieldName)
    const entry = list[idx] ?? list[0]
    const exp = normalizePdfCheckboxExport(entry?.exportValues)
    if (exp) map.set(fieldName, exp)
  }

  cached = map
  return map
}

/** Test-only: reset module cache between cases. */
export function resetPdfCheckboxExportMapCache(): void {
  cached = null
}
