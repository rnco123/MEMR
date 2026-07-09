export type PharmacyRecord = {
  id: number
  name: string | null
  address: string | null
  phone: string | null
  email: string | null
  /** Approximate straight-line miles from the patient's ZIP; null when not computable. */
  distanceMiles?: number | null
}

export function normalizePharmacyRow(
  row: Record<string, unknown>,
  distanceMiles: number | null = null
): PharmacyRecord {
  const phone = (row.phone ?? row.phone_number ?? null) as string | null
  const fallbackAddress = [row.city, row.state, row.zip_code].filter(Boolean).join(', ')
  const address = formatPharmacyDisplayAddress(row) ?? (fallbackAddress || null)
  return {
    id: Number(row.id),
    name: (row.name as string | null) ?? null,
    address,
    phone,
    email: (row.email as string | null) ?? null,
    distanceMiles,
  }
}

export function formatPharmacyDisplayAddress(row: Record<string, unknown>): string | null {
  const street = String(row.address ?? '').trim()
  const cityLine = [row.city, row.state, row.zip_code]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(', ')
  const combined = [street, cityLine].filter(Boolean).join(', ')
  return combined || null
}

export function findPharmacyById(
  pharmacies: PharmacyRecord[],
  pharmacyId: number | string | null | undefined
): PharmacyRecord | null {
  if (pharmacyId == null || pharmacyId === '') return null
  const id = Number(pharmacyId)
  if (!Number.isFinite(id) || id <= 0) return null
  return pharmacies.find((p) => Number(p.id) === id) ?? null
}

export function mergePharmacyIntoList(
  pharmacies: PharmacyRecord[],
  pharmacy: PharmacyRecord | null | undefined
): PharmacyRecord[] {
  if (!pharmacy) return pharmacies
  const id = Number(pharmacy.id)
  if (!Number.isFinite(id)) return pharmacies
  if (pharmacies.some((p) => Number(p.id) === id)) return pharmacies
  return [...pharmacies, pharmacy].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}
