import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { logAuditEvent } from '@/lib/audit-server'
import { tenantCreateSchema } from '@/lib/validation'
import type { TenantRow } from '@/lib/tenants/types'
import { syncTenantToExternal } from '@/lib/locations/external-sync'

export const dynamic = 'force-dynamic'

const TENANT_SELECT = 'id, name, tenant_code, is_active, created_at, updated_at'

export async function GET() {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('tenants')
      .select(TENANT_SELECT)
      .eq('is_active', true)
      .order('tenant_code', { ascending: true })

    if (error) throw error

    return NextResponse.json({ data: (data ?? []) as TenantRow[] })
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

    const parsed = tenantCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const name = parsed.data.name.trim()
    const tenantCode = parsed.data.tenant_code.trim()

    const { data: existing } = await admin
      .from('tenants')
      .select('id')
      .eq('tenant_code', tenantCode)
      .maybeSingle()

    if (existing) {
      throw new ValidationError('Tenant code already exists')
    }

    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('tenants')
      .insert({
        name,
        tenant_code: tenantCode,
        is_active: true,
        updated_at: now,
      })
      .select(TENANT_SELECT)
      .single()

    if (error) throw error

    await logAuditEvent('settings_changed', 'system', data.id, {
      action: 'tenant_created',
      name: data.name,
      tenant_code: data.tenant_code,
      actor_id: user.id,
    })

    const externalSync = await syncTenantToExternal({
      name: data.name,
      tenant_code: data.tenant_code,
      is_active: data.is_active,
    })

    if (externalSync && !externalSync.ok) {
      console.error('[tenants] external sync failed on create:', externalSync.error)
    }

    return NextResponse.json({
      success: true,
      data: data as TenantRow,
      external_sync: externalSync,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
