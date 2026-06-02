import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { STAFF_AVATARS } from '@/lib/avatars/catalog'
import { getStaffAvatarCatalogUrl } from '@/lib/avatars/resolve-url'
import { handleApiError } from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

/** List preset staff avatars (public catalog). */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const avatars = STAFF_AVATARS.map((a) => ({
      id: a.id,
      label: a.label,
      gender: a.gender,
      roleLabel: a.roleLabel,
      url: getStaffAvatarCatalogUrl(a),
    }))

    return NextResponse.json({ avatars })
  } catch (err) {
    return handleApiError(err)
  }
}
