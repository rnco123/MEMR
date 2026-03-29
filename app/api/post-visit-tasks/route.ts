import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { postVisitTaskCreateSchema } from '@/lib/validation'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let q = supabase.from('post_visit_tasks').select('*').order('due_at', { ascending: true, nullsFirst: false })

    if (status && status !== 'all') {
      q = q.eq('status', status)
    }

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = postVisitTaskCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    if (v.encounter_id != null) {
      const { data: enc } = await supabase
        .from('encounters')
        .select('patient_id')
        .eq('id', v.encounter_id)
        .maybeSingle()
      if (!enc) throw new ValidationError('Encounter not found')
      if (Number(enc.patient_id) !== v.patient_id) {
        throw new ValidationError('Patient does not match encounter')
      }
    }

    const { data, error } = await supabase
      .from('post_visit_tasks')
      .insert({
        encounter_id: v.encounter_id ?? null,
        patient_id: v.patient_id,
        task_type: v.task_type,
        title: v.title,
        due_at: v.due_at ?? null,
        notes: v.notes ?? null,
        status: 'open',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
