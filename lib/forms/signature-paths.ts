/**
 * Parse signed_forms.form_paths into patient/physician relative paths, then full storage paths.
 */

/** Must match Storage bucket name (not part of the object key passed to createSignedUrl). */
export const PATIENT_CONSENT_FORMS_BUCKET = 'patient_consent_forms'

export type ParsedSignaturePaths = {
  patientRelative: string | null
  physicianRelative: string | null
}

/**
 * form_paths may be:
 * - JSON array: ["file.jpg"] or ["patient.jpg","physician.jpg"]
 * - JSON object: { "patient": "...", "physician": "..." }
 * - Plain string: "file.jpg" or "17/file.jpg"
 */
export function parseFormPathsRaw(formPathsRaw: string | null | undefined): ParsedSignaturePaths {
  const empty = { patientRelative: null as string | null, physicianRelative: null as string | null }
  if (!formPathsRaw?.trim()) return empty

  const trimmed = formPathsRaw.trim()
  try {
    const j = JSON.parse(trimmed) as unknown
    if (Array.isArray(j)) {
      const a = j.map((x) => String(x).trim()).filter(Boolean)
      return {
        patientRelative: a[0] ?? null,
        physicianRelative: a[1] ?? null,
      }
    }
    if (j && typeof j === 'object') {
      const o = j as Record<string, unknown>
      const p =
        o.patient ??
        o.patient_signature ??
        o.digital_signature ??
        o.patient_guardian ??
        o['patient/guardian']
      const ph = o.physician ?? o.physician_signature ?? o.doctor
      return {
        patientRelative: p != null ? String(p).trim() || null : null,
        physicianRelative: ph != null ? String(ph).trim() || null : null,
      }
    }
  } catch {
    // single path string
  }

  return { patientRelative: trimmed, physicianRelative: null }
}

/**
 * Returns the object path inside the bucket only (e.g. `19/digital_signature.jpg`).
 * Strips accidental bucket prefixes and patterns like `19/patient_consent_forms/19/file.jpg`
 * that break signed-URL resolution when stored in form_paths.
 */
export function normalizeStoragePath(encounterId: number, relative: string | null): string | null {
  if (!relative?.trim()) return null

  let t = relative.trim().replace(/^\/+/, '')

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t)
      let path = u.pathname
      const marker = '/object/public/'
      const i = path.indexOf(marker)
      if (i !== -1) {
        path = path.slice(i + marker.length)
      }
      t = path.replace(/^\/+/, '')
    } catch {
      return null
    }
  }

  const B = PATIENT_CONSENT_FORMS_BUCKET
  while (t.startsWith(`${B}/`)) {
    t = t.slice(B.length + 1)
  }

  // e.g. 19/patient_consent_forms/19/digital_signature.jpg → 19/digital_signature.jpg
  const nested = new RegExp(`^(\\d+)/${B.replace(/-/g, '\\-')}/(\\d+)/(.*)$`)
  const nm = t.match(nested)
  if (nm && nm[1] === nm[2]) {
    t = `${nm[2]}/${nm[3]}`
  }

  t = t
    .split('/')
    .filter((p) => p && p !== B)
    .join('/')

  // 19/19/file.jpg → 19/file.jpg
  const dup = /^(\d+)\/\1\/(.+)$/
  const dm = t.match(dup)
  if (dm) {
    t = `${dm[1]}/${dm[2]}`
  }

  if (/^\d+\//.test(t)) return t
  if (t.length > 0) return `${encounterId}/${t}`
  return null
}
