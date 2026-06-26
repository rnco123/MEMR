import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { consentFormUpdateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const FORM_SELECT = 'id, tenant_id, name, is_active, content, created_at, updated_at'

function parseFormId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid form id')
  return id
}

function rowToApi(row: Record<string, unknown>) {
  const content = row.content as { html?: string; updated_at?: string } | null
  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    name: String(row.name ?? ''),
    is_active: Boolean(row.is_active),
    html: typeof content?.html === 'string' ? content.html : '',
    content_updated_at: content?.updated_at ?? null,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? content?.updated_at ?? null,
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminUser()
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
    const patch: Record<string, unknown> = { updated_at: now }

    if (v.name !== undefined) patch.name = v.name
    if (v.is_active !== undefined) patch.is_active = v.is_active

    if (v.html !== undefined) {
      patch.content = {
        html: v.html,
        updated_at: now,
      }
    }

    if (Object.keys(patch).length === 1) {
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

    const { data, error } = await admin
      .from('forms')
      .update({ is_active: false, updated_at: new Date().toISOString() })
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
