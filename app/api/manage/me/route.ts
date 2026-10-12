import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { requireClinicManager } from '@/lib/manage/auth'

export const dynamic = 'force-dynamic'

/** The manager's tenant, for the /manage header. */
export async function GET() {
  try {
    const { tenantId, admin } = await requireClinicManager()
    const { data, error } = await admin
      .from('tenants')
      .select('id, name, tenant_code')
      .eq('id', tenantId)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ tenant: data })
  } catch (e) {
    return handleApiError(e)
  }
}
