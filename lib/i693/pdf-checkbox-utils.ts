/** Shared helpers for USCIS I-693 AcroForm checkboxes (/V vs /export value). */

export function normalizePdfCheckboxExport(exportValues: unknown): string | undefined {
  if (typeof exportValues !== 'string') return undefined
  const trimmed = exportValues.trim()
  return trimmed || undefined
}

/** True when stored editor/export state means this checkbox should be checked. */
export function wantPdfCheckboxChecked(storedValue: string, pdfExport?: string): boolean {
  const val = storedValue.trim()
  if (!val || val === 'Off') return false
  if (val === 'On' || val === 'Yes' || val === 'true') return true
  const exp = pdfExport?.trim()
  if (!exp) return false
  if (val === exp) return true
  return val.toLowerCase() === exp.toLowerCase()
}

/** True when pdf.js / AcroForm reports a mark widget as checked. */
export function isMarkWidgetChecked(
  rawValue: string,
  binding: { when: string; pdfExport?: string }
): boolean {
  const val = rawValue.trim()
  if (!val || val === 'Off') return false
  if (val === 'On' || val === 'Yes' || val === 'true') return true
  const when = binding.when.trim()
  const pdfExport = binding.pdfExport?.trim() ?? when
  return val === when || val === pdfExport || val.toLowerCase() === pdfExport.toLowerCase()
}

export function pdfExportForCheckbox(binding: {
  when: string
  pdfExport?: string
}): string {
  return binding.pdfExport?.trim() || binding.when.trim()
}
