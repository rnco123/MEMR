import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuthenticationError, handleApiError } from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const admin = createAdminClient()
    const { data: services, error: servicesError } = await admin
      .from('services')
      .select('id, title_en, title_es')
      .order('title_en', { ascending: true })

    if (servicesError) throw servicesError

    return NextResponse.json({ services: services ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}
