import generatedMap from '@/lib/i693/pdf-checkbox-export-map.generated.json'

let cached: Map<string, string> | null = null

/** Full PDF field name → checkbox /export value (from pre-generated template metadata). */
export async function loadPdfCheckboxExportMap(
  _templatePath?: string | null
): Promise<Map<string, string>> {
  if (cached) return cached
  cached = new Map(Object.entries(generatedMap as Record<string, string>))
  return cached
}

/** Test-only: reset module cache between cases. */
export function resetPdfCheckboxExportMapCache(): void {
  cached = null
}
