import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { logAuditEvent } from '@/lib/audit-server'
import { tenantCreateSchema } from '@/lib/validation'
import { bridgeGet, bridgePost } from '@/lib/bridge/sync'
import type { TenantRow } from '@/lib/tenants/types'

export const dynamic = 'force-dynamic'

/**
 * Tenants live behind mcm-bridge, which owns both Supabase projects. This route keeps
 * admin auth, validation and auditing; the bridge does the writing and keeps the
 * portal copy in step.
 */
export async function GET() {
  try {
    await requireAdminUser()
    const data = await bridgeGet<TenantRow[]>('/tenants')
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminUser()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = tenantCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const result = await bridgePost<{ data: TenantRow }>('/tenants', {
      name: parsed.data.name.trim(),
      tenant_code: parsed.data.tenant_code.trim(),
    })

    await logAuditEvent('settings_changed', 'system', result.data.id, {
      action: 'tenant_created',
      name: result.data.name,
      tenant_code: result.data.tenant_code,
      actor_id: user.id,
    })

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
