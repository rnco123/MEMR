import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { FORM_SELECT, resolveAdminFormUpdater, rowToApi } from '@/lib/forms/form-admin-api'
import { consentFormUpdateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

function parseFormId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid form id')
  return id
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const admin = createAdminClient()
    const formId = parseFormId(params.id)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = consentFormUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    const now = new Date().toISOString()
    const updater = await resolveAdminFormUpdater(admin, user)
    const patch: Record<string, unknown> = {
      updated_at: now,
      updated_by: updater.updated_by,
      updated_by_name: updater.updated_by_name,
    }

    if (v.name !== undefined) patch.name = v.name
    if (v.is_active !== undefined) patch.is_active = v.is_active

    if (v.html !== undefined) {
      patch.content = {
        html: v.html,
        updated_at: now,
      }
    }

    if (v.name === undefined && v.is_active === undefined && v.html === undefined) {
      throw new ValidationError('No fields to update')
    }

    const { data, error } = await admin
      .from('forms')
      .update(patch)
      .eq('id', formId)
      .select(FORM_SELECT)
      .single()

    if (error) throw error
    if (!data) throw new ValidationError('Form not found')

    return NextResponse.json({ success: true, data: rowToApi(data as Record<string, unknown>) })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()
    const formId = parseFormId(params.id)

    const { data: existing, error: fetchError } = await admin
      .from('forms')
      .select('id, is_active')
      .eq('id', formId)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing) throw new ValidationError('Form not found')
    if (existing.is_active) {
      throw new ValidationError('Deactivate the form before deleting it permanently')
    }

    const { error } = await admin.from('forms').delete().eq('id', formId)
    if (error) throw error

    return NextResponse.json({ success: true, id: formId })
  } catch (e) {
    return handleApiError(e)
  }
}
