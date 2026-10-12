import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { logAuditEvent } from '@/lib/audit-server'
import { FORM_SELECT, resolveAdminFormUpdater, rowToApi } from '@/lib/forms/form-admin-api'
import { requireClinicManager } from '@/lib/manage/auth'
import { consentFormCreateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** Tenant is always the manager's own; it is never taken from the request. */
const manageFormCreateSchema = consentFormCreateSchema.omit({ tenant_id: true })

/** The manager's clinic's consent forms — same table and shape as Admin → Consent Forms. */
export async function GET() {
  try {
    const { tenantId, admin } = await requireClinicManager()
    const { data, error } = await admin
      .from('forms')
      .select(FORM_SELECT)
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ data: (data ?? []).map((r) => rowToApi(r as Record<string, unknown>)) })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const { user, tenantId, admin } = await requireClinicManager()
    const parsed = manageFormCreateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid input')

    const v = parsed.data
    const now = new Date().toISOString()
    const updater = await resolveAdminFormUpdater(admin, user)
    const { data, error } = await admin
      .from('forms')
      .insert({
        tenant_id: tenantId,
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

    await logAuditEvent('settings_changed', 'system', data.id as number, {
      action: 'consent_form_created',
      source: 'clinic_manager',
      tenant_id: tenantId,
      name: v.name,
      actor_id: user.id,
    })

    return NextResponse.json({ success: true, data: rowToApi(data as Record<string, unknown>) })
  } catch (e) {
    return handleApiError(e)
  }
}
