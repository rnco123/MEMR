import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { postVisitTaskUpdateSchema } from '@/lib/validation'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'
import { guardPostVisitTaskAccess } from '@/lib/encounters/guard'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const taskId = Number(params.taskId)
    if (!Number.isFinite(taskId)) throw new ValidationError('Invalid task id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    await guardPostVisitTaskAccess(user.id, taskId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = postVisitTaskUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...parsed.data,
    }

    const { data, error } = await supabase.from('post_visit_tasks').update(patch).eq('id', taskId).select().single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
