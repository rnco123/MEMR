import { readFile } from 'fs/promises'
import path from 'path'
import type { I693FormData } from '@/lib/i693/types'
import { I693_UI_SECTIONS } from '@/lib/i693/field-sections'
import { applyToPdfForm } from '@/lib/i693/pdf-acroform-map'
import { fillAcroformI693PdfMupdf } from '@/lib/i693/fill-acroform-mupdf'
import { fillFlatI693Pdf, isFlatI693Template } from '@/lib/i693/fill-flat-pdf'
import { templateUsesNativeWidgets } from '@/lib/i693/extract-pdf-widgets'
import { validateI693PdfExport } from '@/lib/i693/export-validation'
import { drawI693AnnotationsOnPdf, type I693Annotation } from '@/lib/i693/annotations'

const TEMPLATE_CANDIDATES = [
  'public/forms/i-693-template.pdf',
  'public/forms/i693-template.pdf',
  'public/forms/uscis-i-693.pdf',
]

export async function resolveI693TemplatePath(): Promise<string | null> {
  const root = process.cwd()
  for (const rel of TEMPLATE_CANDIDATES) {
    const full = path.join(root, rel)
    try {
      await readFile(full)
      return full
    } catch {
      /* try next */
    }
  }
  return null
}

function fieldsForSection(data: I693FormData, section: (typeof I693_UI_SECTIONS)[number]): string[] {
  const root = data as unknown as Record<string, unknown>
  const lines: string[] = []
  for (const field of section.fields) {
    const parts = field.key.split('.')
    let cur: unknown = root
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') {
        cur = undefined
        break
      }
      cur = (cur as Record<string, unknown>)[p]
    }
    if (cur == null || cur === '') continue
    const display = typeof cur === 'boolean' ? (cur ? 'Yes' : 'No') : String(cur)
    lines.push(`${field.label}: ${display}`)
  }
  return lines
}

/** Fill USCIS AcroForm template when present; otherwise build a summary PDF with jsPDF */
export async function generateI693PdfBytes(
  data: I693FormData,
  annotations: I693Annotation[] = []
): Promise<{
  bytes: Uint8Array
  mode: 'acroform' | 'overlay' | 'generated'
  filledFields?: string[]
  missingFields?: string[]
}> {
  const templatePath = await resolveI693TemplatePath()
  if (templatePath) {
    if (await templateUsesNativeWidgets(templatePath)) {
      const { bytes, filled } = await fillAcroformI693PdfMupdf(templatePath, data)
      const validation = await validateI693PdfExport(bytes, {
        templatePath,
        expectedFilledFields: filled.length,
      })
      if (process.env.NODE_ENV !== 'production') {
        console.info('[i693/pdf] export validation', validation)
      }
      return {
        bytes: await drawI693AnnotationsOnPdf(bytes, annotations),
        mode: 'acroform',
        filledFields: filled,
        missingFields: [],
      }
    }

    const flat = await isFlatI693Template(templatePath)
    if (flat) {
      const { bytes, filled } = await fillFlatI693Pdf(templatePath, data)
      return {
        bytes: await drawI693AnnotationsOnPdf(bytes, annotations),
        mode: 'overlay',
        filledFields: filled,
        missingFields: [],
      }
    }

    const { PDFDocument } = await import('pdf-lib')
    const existing = await readFile(templatePath)
    const doc = await PDFDocument.load(existing, { ignoreEncryption: true })
    const form = doc.getForm()
    if (!form) {
      const { bytes, filled } = await fillFlatI693Pdf(templatePath, data)
      return {
        bytes,
        mode: 'overlay',
        filledFields: filled,
        missingFields: [],
      }
    }

    const result = applyToPdfForm(
      (name) => {
        try {
          return form.getTextField(name)
        } catch {
          return undefined
        }
      },
      (name) => {
        try {
          return form.getCheckBox(name)
        } catch {
          return undefined
        }
      },
      data
    )

    try {
      form.updateFieldAppearances()
    } catch {
      /* some PDFs lack appearance streams */
    }

    const bytes = await doc.save()
    return {
      bytes: await drawI693AnnotationsOnPdf(bytes, annotations),
      mode: 'acroform',
      filledFields: result.filled,
      missingFields: result.missing,
    }
  }

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const left = 48
  const maxW = 515
  let y = 48
  const line = (label: string, value: string, bold = false) => {
    if (y > 720) {
      doc.addPage()
      y = 48
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 11 : 10)
    doc.text(label, left, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(value || '—', maxW)
    doc.text(lines, left, y)
    y += lines.length * 12 + 8
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('USCIS Form I-693 — Digital Summary (MEMR)', left, y)
  y += 24
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(
    'All parts 1–14 from digital form. For official filing, add USCIS fillable PDF at public/forms/i-693-template.pdf.',
    left,
    y,
    { maxWidth: maxW }
  )
  y += 28

  for (const section of I693_UI_SECTIONS) {
    const lines = fieldsForSection(data, section)
    if (lines.length === 0) continue
    line(section.title, '', true)
    for (const l of lines) {
      const idx = l.indexOf(': ')
      if (idx === -1) line(l, '')
      else line(l.slice(0, idx), l.slice(idx + 2))
    }
  }

  if (data.vaccinations.length > 0) {
    line('Part 13 — Vaccination record', '', true)
    for (const v of data.vaccinations) {
      line(v.vaccine_name, `${v.date_given || '—'} ${v.waiver_reason ? `(${v.waiver_reason})` : ''}`)
    }
  }

  const ab = doc.output('arraybuffer')
  return { bytes: await drawI693AnnotationsOnPdf(new Uint8Array(ab), annotations), mode: 'generated' }
}
