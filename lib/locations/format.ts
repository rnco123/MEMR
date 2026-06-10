const GOOGLE_MAP_HOST_PATTERNS = [
  /^https?:\/\/(www\.)?google\.[a-z.]+\/maps/i,
  /^https?:\/\/maps\.google\.[a-z.]+/i,
  /^https?:\/\/goo\.gl\/maps/i,
  /^https?:\/\/maps\.app\.goo\.gl/i,
]

export type GoogleMapUrlResult = {
  url: string | null
  valid: boolean
  derivedFrom?: 'link' | 'coordinates' | 'address'
}

function tryParseUrl(input: string): URL | null {
  try {
    const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
    return new URL(withProtocol)
  } catch {
    return null
  }
}

function isGoogleMapsUrl(href: string): boolean {
  return GOOGLE_MAP_HOST_PATTERNS.some((pattern) => pattern.test(href))
}

/** Normalize Google Maps input: full URL, short link, or lat,lng; otherwise derive from address. */
export function resolveGoogleMapUrl(
  mapInput: string | null | undefined,
  address?: string | null
): GoogleMapUrlResult {
  const raw = (mapInput ?? '').trim()

  if (raw) {
    const coordMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (coordMatch) {
      const lat = coordMatch[1]
      const lng = coordMatch[2]
      return {
        url: `https://www.google.com/maps?q=${lat},${lng}`,
        valid: true,
        derivedFrom: 'coordinates',
      }
    }

    const parsed = tryParseUrl(raw)
    if (parsed && isGoogleMapsUrl(parsed.href)) {
      return { url: parsed.href, valid: true, derivedFrom: 'link' }
    }

    if (
      raw.includes('google.com/maps') ||
      raw.includes('maps.app.goo.gl') ||
      raw.includes('goo.gl/maps')
    ) {
      const fixed = tryParseUrl(raw.startsWith('http') ? raw : `https://${raw}`)
      if (fixed && isGoogleMapsUrl(fixed.href)) {
        return { url: fixed.href, valid: true, derivedFrom: 'link' }
      }
    }

    return { url: null, valid: false }
  }

  const addr = (address ?? '').trim()
  if (addr) {
    return {
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`,
      valid: true,
      derivedFrom: 'address',
    }
  }

  return { url: null, valid: true }
}

export function normalizePhone(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/[^\d+().\-\s]/g, '').trim()
  return cleaned || null
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim().toLowerCase()
  return raw || null
}
