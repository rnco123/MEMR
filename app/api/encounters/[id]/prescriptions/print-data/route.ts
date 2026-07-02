import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import { loadPrescriptionPrintContext } from '@/lib/prescriptions/load-prescription-print-context'
import { CLINICAL_STAFF_WITH_ADMIN_ROLE_SET } from '@/lib/roles'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

function parsePrescriptionIds(raw: string | null): number[] | undefined {
  if (!raw?.trim()) return undefined
  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)
  return ids.length > 0 ? ids : undefined
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!roleInfo?.role || !CLINICAL_STAFF_WITH_ADMIN_ROLE_SET.has(roleInfo.role)) {
      throw new AuthorizationError()
    }

    const admin = await guardEncounterAccess(user.id, encounterId)
    const prescriptionIds = parsePrescriptionIds(
      new URL(request.url).searchParams.get('prescription_ids')
    )

    const data = await loadPrescriptionPrintContext(admin, encounterId, { prescriptionIds })

    // Print context includes patient + prescriber + full Rx detail.
    auditPhi({
      user,
      role: roleInfo.role,
      action: 'prescription_viewed',
      resourceType: 'prescription',
      resourceId: encounterId,
      metadata: { scope: 'print', prescription_ids: prescriptionIds ?? 'all' },
      request,
    })

    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}
