import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import type { ComplianceDatePreset } from '@/lib/compliance/date-presets'
import { loadComplianceDashboard } from '@/lib/compliance/load-compliance-dashboard'
import { requireComplianceAccess } from '@/lib/compliance/require-compliance-access'
import type { ComplianceQueryParams } from '@/lib/compliance/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const PRESETS: ComplianceDatePreset[] = ['today', 'last7', 'last30', 'thisMonth', 'lastMonth']

function parseQuery(req: NextRequest): ComplianceQueryParams {
  const sp = req.nextUrl.searchParams
  const preset = sp.get('preset') as ComplianceDatePreset | null
  if (!preset || !PRESETS.includes(preset)) {
    throw new ValidationError('Invalid preset')
  }

  const statusRaw = sp.get('status')
  let status: ComplianceQueryParams['status'] = 'all'
  if (statusRaw === 'compliant' || statusRaw === 'warning' || statusRaw === 'critical') {
    status = statusRaw
  }

  const provider = sp.get('provider')
  const clinic = sp.get('clinic')

  return {
    preset,
    provider: provider && provider !== '__all__' ? provider : '__all__',
    clinic: clinic && clinic !== '__all__' ? clinic : '__all__',
    status,
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireComplianceAccess()
    const params = parseQuery(req)
    const admin = createAdminClient()
    const data = await loadComplianceDashboard(admin, params, session.locationScope)
    return NextResponse.json(data)
  } catch (err) {
    return handleApiError(err)
  }
}
