import { normalizeStateAbbrev } from '@/lib/i693/ai-fill'
import { splitAddressForPatientRecord } from '@/lib/address/parse-patient-address'

const MAPBOX_SUGGEST_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest'

export type AddressSuggestion = {
  /** Full one-line label shown in the dropdown. */
  fullAddress: string
  /** Street line plus city, matching the patient/pharmacy `street_address` column. */
  streetAddress: string
  city: string
  /** Two-letter state abbreviation. */
  state: string
  zipCode: string
}

type MapboxContext = {
  address?: { name?: string; address_number?: string; street_name?: string }
  street?: { name?: string }
  place?: { name?: string }
  region?: { name?: string; region_code?: string }
  postcode?: { name?: string }
}

type MapboxSuggestion = {
  name?: string
  full_address?: string
  place_formatted?: string
  address?: string
  feature_type?: string
  context?: MapboxContext
}

function newSessionToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Build the structured fields from Mapbox context, falling back to parsing the label. */
function toAddressSuggestion(s: MapboxSuggestion): AddressSuggestion | null {
  const name = s.name?.trim() ?? ''
  const placeFormatted = s.place_formatted?.trim() ?? ''
  const fullAddress =
    s.full_address?.trim() || [name, placeFormatted].filter(Boolean).join(', ').trim()

  if (!fullAddress) return null

  const ctx = s.context ?? {}
  const city = ctx.place?.name?.trim() ?? ''
  const state = normalizeStateAbbrev(ctx.region?.region_code || ctx.region?.name || '')
  const zipCode = ctx.postcode?.name?.trim() ?? ''

  // `s.address`/`context.address` carry the house-numbered street line. For
  // `street`/`address` features `name` is the properly-cased street itself, but
  // for a POI `name` is the brand ("Walgreens"), which must not become the street.
  const named = s.feature_type === 'address' || s.feature_type === 'street' ? name : ''
  const streetLine = (s.address?.trim() || ctx.address?.name?.trim() || named).trim()

  // Mapbox context is authoritative when present; otherwise parse the label so
  // POI results (which omit some context) still populate the fields.
  const parsed = splitAddressForPatientRecord(fullAddress)
  const streetAddress =
    streetLine && streetLine.toLowerCase() !== city.toLowerCase()
      ? [streetLine, city].filter(Boolean).join(', ').trim()
      : streetLine || city

  return {
    fullAddress,
    streetAddress: streetAddress || parsed.street_address,
    city,
    state: state || parsed.state,
    zipCode: zipCode || parsed.zip_code,
  }
}

export function isAddressLookupConfigured(): boolean {
  return Boolean(process.env.MAPBOX_ACCESS_TOKEN)
}

export async function fetchAddressSuggestions(search: string): Promise<AddressSuggestion[]> {
  const query = search.trim()
  if (query.length < 3) return []

  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token) return []

  const url = new URL(MAPBOX_SUGGEST_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('country', 'US')
  url.searchParams.set('language', 'en')
  url.searchParams.set('limit', '8')
  // Addresses and POIs only: `postcode`/`place` results have no street line and
  // would otherwise write a bare ZIP or city name into the street field.
  url.searchParams.set('types', 'address,street,poi')
  url.searchParams.set('session_token', newSessionToken())
  url.searchParams.set('access_token', token)

  const res = await fetch(url.toString(), { method: 'GET' })
  if (!res.ok) return []

  const data = (await res.json()) as { suggestions?: MapboxSuggestion[] }

  const seen = new Set<string>()
  return (data.suggestions ?? [])
    .map(toAddressSuggestion)
    .filter((s): s is AddressSuggestion => s !== null)
    .filter((s) => {
      const key = s.fullAddress.toLowerCase().trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}
