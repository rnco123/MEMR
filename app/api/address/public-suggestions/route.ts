import { NextRequest, NextResponse } from 'next/server'
import { fetchAddressSuggestions } from '@/lib/address/suggestions'
import { rateLimitCheck } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Generous enough for typing a few addresses, low enough to stop the Mapbox key
// being used as a free geocoder.
const PUBLIC_LOOKUP_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 }

/**
 * Address autocomplete for the public clinic signup page, where no one is signed in.
 * Same Mapbox lookup as /api/address/suggestions, which stays auth-only.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.ip ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  if (!rateLimitCheck(`address-public:${ip}`, PUBLIC_LOOKUP_LIMIT)) {
    return NextResponse.json({ success: true, count: 0, suggestions: [] }, { status: 429 })
  }

  const search = req.nextUrl.searchParams.get('search')?.trim().slice(0, 200) ?? ''
  if (search.length < 4) {
    return NextResponse.json({ success: true, count: 0, suggestions: [] })
  }

  try {
    const suggestions = await fetchAddressSuggestions(search)
    return NextResponse.json({ success: true, count: suggestions.length, suggestions })
  } catch {
    return NextResponse.json({ success: true, count: 0, suggestions: [] })
  }
}
