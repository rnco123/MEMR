import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAddressSuggestions } from '@/lib/address/suggestions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() ?? ''

  if (search.length < 3) {
    return NextResponse.json({ success: true, count: 0, suggestions: [] })
  }

  try {
    const merged = await fetchAddressSuggestions(search)
    return NextResponse.json({
      success: true,
      count: merged.length,
      suggestions: merged.map((fullAddress) => ({ fullAddress })),
    })
  } catch {
    return NextResponse.json({ success: true, count: 0, suggestions: [] })
  }
}
