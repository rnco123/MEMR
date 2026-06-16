import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encounterOrderUpdateSchema } from '@/lib/validation'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'
import { guardOrderAccess } from '@/lib/encounters/guard'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { orderId: string } }) {
  try {
    const orderId = Number(params.orderId)
    if (!Number.isFinite(orderId)) throw new ValidationError('Invalid order id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    await guardOrderAccess(user.id, orderId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = encounterOrderUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (parsed.data.status) {
      patch.status = parsed.data.status
      if (parsed.data.status === 'completed') {
        patch.completed_at = new Date().toISOString()
        patch.completed_by_uid = user.id
      }
      if (parsed.data.status !== 'completed') {
        patch.completed_at = null
        patch.completed_by_uid = null
      }
    }

    const { data, error } = await supabase.from('encounter_orders').update(patch).eq('id', orderId).select().single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
