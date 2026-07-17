import zipcodes from 'zipcodes'
import type { PharmacyRecord } from '@/lib/pharmacies/normalize'

/**
 * Proximity ranking for the pharmacy picker. A chain like Walmart or CVS has
 * many rows in the registry, so once the user types a name we sort the matches
 * by straight-line distance from the patient's ZIP and surface that distance in
 * the dropdown. Distances are ZIP-centroid approximations (hence "~N mi"), not
 * driving distance — deterministic, offline, and free (bundled dataset).
 */

const ZIP5 = /(\d{5})(?:-\d{4})?/

/** First 5-digit US ZIP found in a string, or null. */
export function normalizeZip(raw: string | number | null | undefined): string | null {
  if (raw == null) return null
  const match = String(raw).trim().match(ZIP5)
  return match?.[1] ?? null
}

/** Pull a ZIP from a pharmacy row: the explicit column first, then the address text. */
export function extractPharmacyZip(row: Record<string, unknown>): string | null {
  return normalizeZip(row.zip_code as string | null) ?? normalizeZip(row.address as string | null)
}

/** Straight-line miles between two US ZIPs via bundled centroids; null if either is unknown. */
export function zipDistanceMiles(
  anchorZip: string | number | null | undefined,
  targetZip: string | number | null | undefined
): number | null {
  const a = normalizeZip(anchorZip)
  const b = normalizeZip(targetZip)
  if (!a || !b) return null
  const miles = zipcodes.distance(a, b)
  return typeof miles === 'number' && Number.isFinite(miles) ? miles : null
}

/**
 * Stable nearest-first ordering: rows with a known distance come first ascending,
 * ties and unknown-distance rows fall back to alphabetical by name.
 */
export function sortPharmaciesByDistance(records: PharmacyRecord[]): PharmacyRecord[] {
  const byName = (a: PharmacyRecord, b: PharmacyRecord) =>
    (a.name ?? '').localeCompare(b.name ?? '')
  return [...records].sort((a, b) => {
    const da = a.distanceMiles
    const db = b.distanceMiles
    if (da != null && db != null) return da - db || byName(a, b)
    if (da != null) return -1
    if (db != null) return 1
    return byName(a, b)
  })
}
