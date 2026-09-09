const MAPBOX_SUGGEST_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest'

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
  return Boolean(process.env.MAPBOX_ACCESS_TOKEN)
}

export async function fetchAddressSuggestions(search: string): Promise<string[]> {
  const query = search.trim()
  if (query.length < 3) return []

  const seen = new Set<string>()
  return (await fetchMapboxSuggestions(query))
    .filter((s) => {
      const key = s.toLowerCase().trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}
