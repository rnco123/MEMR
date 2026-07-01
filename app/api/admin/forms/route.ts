import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { FORM_SELECT, resolveAdminFormUpdater, rowToApi } from '@/lib/forms/form-admin-api'
import { consentFormCreateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

function parseTenantId(raw: string | null): number | null {
  if (!raw?.trim()) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET(request: Request) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()
    const tenantId = parseTenantId(new URL(request.url).searchParams.get('tenant_id'))

    let query = admin.from('forms').select(FORM_SELECT).order('name', { ascending: true })
    if (tenantId != null) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data: (data ?? []).map((r) => rowToApi(r as Record<string, unknown>)) })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminUser()
    const admin = createAdminClient()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = consentFormCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    const now = new Date().toISOString()
    const updater = await resolveAdminFormUpdater(admin, user)

    const { data, error } = await admin
      .from('forms')
      .insert({
        tenant_id: v.tenant_id,
        name: v.name,
        is_active: v.is_active ?? true,
        content: { html: v.html, updated_at: now },
        updated_at: now,
        updated_by: updater.updated_by,
        updated_by_name: updater.updated_by_name,
      })
      .select(FORM_SELECT)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data: rowToApi(data as Record<string, unknown>) })
  } catch (e) {
    return handleApiError(e)
  }
}
