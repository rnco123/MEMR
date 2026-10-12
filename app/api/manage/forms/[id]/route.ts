import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { logAuditEvent } from '@/lib/audit-server'
import { FORM_SELECT, resolveAdminFormUpdater, rowToApi } from '@/lib/forms/form-admin-api'
import { requireClinicManager, type ClinicManagerContext } from '@/lib/manage/auth'
import { consentFormUpdateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

function parseFormId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid form id')
  return id
}

/** Loads the form only if it belongs to the manager's tenant. */
async function loadOwnForm(ctx: ClinicManagerContext, formId: number) {
  const { data, error } = await ctx.admin
    .from('forms')
    .select('id, tenant_id, is_active')
    .eq('id', formId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.tenant_id !== ctx.tenantId) throw new ValidationError('Form not found')
  return data
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireClinicManager()
    const formId = parseFormId(params.id)
    await loadOwnForm(ctx, formId)

    const parsed = consentFormUpdateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid input')
    const v = parsed.data
    if (v.name === undefined && v.is_active === undefined && v.html === undefined) {
      throw new ValidationError('No fields to update')
    }

    const now = new Date().toISOString()
    const updater = await resolveAdminFormUpdater(ctx.admin, ctx.user)
    const patch: Record<string, unknown> = {
      updated_at: now,
      updated_by: updater.updated_by,
      updated_by_name: updater.updated_by_name,
    }
    if (v.name !== undefined) patch.name = v.name
    if (v.is_active !== undefined) patch.is_active = v.is_active
    if (v.html !== undefined) patch.content = { html: v.html, updated_at: now }

    const { data, error } = await ctx.admin
      .from('forms')
      .update(patch)
      .eq('id', formId)
      .eq('tenant_id', ctx.tenantId)
      .select(FORM_SELECT)
      .single()
    if (error) throw error

    await logAuditEvent('settings_changed', 'system', formId, {
      action: 'consent_form_updated',
      source: 'clinic_manager',
      tenant_id: ctx.tenantId,
      fields: Object.keys(v),
      actor_id: ctx.user.id,
    })

    return NextResponse.json({ success: true, data: rowToApi(data as Record<string, unknown>) })
  } catch (e) {
    return handleApiError(e)
  }
}

/** Same rule as admin: a form must be deactivated before it can be deleted. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireClinicManager()
    const formId = parseFormId(params.id)
    const existing = await loadOwnForm(ctx, formId)
    if (existing.is_active) throw new ValidationError('Deactivate the form before deleting it permanently')

    const { error } = await ctx.admin.from('forms').delete().eq('id', formId).eq('tenant_id', ctx.tenantId)
    if (error) throw error

    await logAuditEvent('settings_changed', 'system', formId, {
      action: 'consent_form_deleted',
      source: 'clinic_manager',
      tenant_id: ctx.tenantId,
      actor_id: ctx.user.id,
    })

    return NextResponse.json({ success: true, id: formId })
  } catch (e) {
    return handleApiError(e)
  }
}
