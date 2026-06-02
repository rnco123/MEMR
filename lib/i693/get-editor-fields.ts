import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveI693TemplatePath } from '@/lib/i693/generate-pdf'
import {
  extractPdfWidgetEditorFields,
  type PdfWidgetEditorField,
} from '@/lib/i693/extract-pdf-widgets'

const memoryCache = new Map<string, PdfWidgetEditorField[]>()

function cacheKey(templatePath: string): string {
  return createHash('sha256').update(`${templatePath}:editor-fields-v2`).digest('hex').slice(0, 16)
}

async function cacheDir(): Promise<string> {
  const dir = path.join(process.cwd(), '.cache', 'i693-editor-fields')
  await mkdir(dir, { recursive: true })
  return dir
}

/** Native PDF widget placements for the form editor (always from MuPDF, not manual overlay). */
export async function getI693EditorFields(): Promise<{
  pdfMode: 'acroform' | 'overlay'
  fields: PdfWidgetEditorField[]
}> {
  const templatePath = await resolveI693TemplatePath()
  if (!templatePath) return { pdfMode: 'overlay', fields: [] }

  const key = cacheKey(templatePath)
  const mem = memoryCache.get(key)
  if (mem) return { pdfMode: 'acroform', fields: mem }

  try {
    const file = path.join(await cacheDir(), `${key}.json`)
    if (existsSync(file)) {
      const fields = JSON.parse(await readFile(file, 'utf8')) as PdfWidgetEditorField[]
      if (fields.length >= 12) {
        memoryCache.set(key, fields)
        return { pdfMode: 'acroform', fields }
      }
    }
  } catch {
    /* re-extract */
  }

  const fields = await extractPdfWidgetEditorFields(templatePath)
  if (fields.length < 12) return { pdfMode: 'overlay', fields: [] }

  memoryCache.set(key, fields)
  void writeFile(path.join(await cacheDir(), `${key}.json`), JSON.stringify(fields), 'utf8')
  return { pdfMode: 'acroform', fields }
}
