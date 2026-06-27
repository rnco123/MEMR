type AutocompleteSuggestion = {
  street_line?: string
  secondary?: string
  city?: string
  state?: string
  zipcode?: string
}

type AutocompleteResponse = {
  suggestions?: AutocompleteSuggestion[]
}

const SMARTY_URL = 'https://us-autocomplete-pro.api.smartystreets.com/lookup'
const MAPBOX_SUGGEST_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest'

function formatSmartySuggestion(s: AutocompleteSuggestion): string {
  return [s.street_line, s.secondary, s.city, s.state, s.zipcode].filter(Boolean).join(', ')
}

async function fetchSmartySuggestions(search: string): Promise<string[]> {
  const authId = process.env.SMARTY_AUTH_ID
  const authToken = process.env.SMARTY_AUTH_TOKEN
  if (!authId || !authToken) return []

  const url = new URL(SMARTY_URL)
  url.searchParams.set('auth-id', authId)
  url.searchParams.set('auth-token', authToken)
  url.searchParams.set('search', search)
  url.searchParams.set('max_results', '5')

  const res = await fetch(url.toString(), { method: 'GET' })
  if (!res.ok) return []

  const data = (await res.json()) as AutocompleteResponse
  return (data?.suggestions ?? []).map(formatSmartySuggestion).filter(Boolean)
}

async function fetchMapboxSuggestions(search: string): Promise<string[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token) return []

  const sessionToken =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const url = new URL(MAPBOX_SUGGEST_URL)
  url.searchParams.set('q', search)
  url.searchParams.set('country', 'US')
  url.searchParams.set('language', 'en')
  url.searchParams.set('limit', '5')
  url.searchParams.set('session_token', sessionToken)
  url.searchParams.set('access_token', token)

  const res = await fetch(url.toString(), { method: 'GET' })
  if (!res.ok) return []

  const data = (await res.json()) as {
    suggestions?: Array<{ full_address?: string; name?: string; place_formatted?: string }>
  }

  return (data.suggestions ?? [])
    .map((s) => s.full_address?.trim() || [s.name, s.place_formatted].filter(Boolean).join(', ').trim())
    .filter(Boolean)
}

export function isAddressLookupConfigured(): boolean {
  return Boolean(
    (process.env.SMARTY_AUTH_ID && process.env.SMARTY_AUTH_TOKEN) || process.env.MAPBOX_ACCESS_TOKEN
  )
}

export async function fetchAddressSuggestions(search: string): Promise<string[]> {
  const query = search.trim()
  if (query.length < 3) return []

  const [mapbox, smarty] = await Promise.all([
    fetchMapboxSuggestions(query),
    fetchSmartySuggestions(query),
  ])

  const seen = new Set<string>()
  return [...mapbox, ...smarty].filter((s) => {
    const key = s.toLowerCase().trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 8)
}
