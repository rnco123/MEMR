import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { getI693EditorFields } from '@/lib/i693/get-editor-fields'
import { isI693ApiRole } from '@/lib/immigration/api-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    if (!isI693ApiRole((await fetchUserRole(supabase, user.id))?.role)) {
      throw new AuthorizationError()
    }

    const { pdfMode, fields } = await getI693EditorFields()
    return NextResponse.json({
      data: {
        pdfMode,
        editorFields: fields,
        fieldCount: fields.length,
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
