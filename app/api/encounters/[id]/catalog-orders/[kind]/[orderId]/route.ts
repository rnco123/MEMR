import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { canEditClinicalEncounterContent } from '@/lib/roles'
import { guardEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/guard'
import {
  assertEncounterOrdersEditable,
  CATALOG_ORDER_CONFIG,
  parseCatalogOrderKind,
  parsePositiveId,
} from '@/lib/orders/catalog-orders'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

const updateBodySchema = z.object({
  qty: z.number().int().positive().max(999),
})

async function requireClinicalEditor() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new AuthenticationError()

  const roleInfo = await fetchUserRole(supabase, user.id)
  if (!canEditClinicalEncounterContent(roleInfo?.role)) {
    throw new AuthorizationError('Clinical staff only')
  }
  return { user, role: roleInfo!.role }
}

async function requireExistingOrder(
  admin: Awaited<ReturnType<typeof guardEncounterAccess>>,
  table: string,
  encounterId: number,
  orderId: number
) {
  const { data, error } = await admin
    .from(table)
    .select('id')
    .eq('id', orderId)
    .eq('encounter_id', encounterId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Order not found')
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; kind: string; orderId: string } }
) {
  try {
    const encounterId = parsePositiveId(params.id, 'encounter id')
    const orderId = parsePositiveId(params.orderId, 'order id')
    const kind = parseCatalogOrderKind(params.kind)
    const { user, role } = await requireClinicalEditor()
    const admin = await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)
    await assertEncounterOrdersEditable(admin, encounterId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }
    const parsed = updateBodySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const config = CATALOG_ORDER_CONFIG[kind]
    await requireExistingOrder(admin, config.table, encounterId, orderId)

    const { data, error } = await admin
      .from(config.table)
      .update({ qty: parsed.data.qty, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('encounter_id', encounterId)
      .select(config.select)
      .single()
    if (error) throw error

    auditPhi({
      user,
      role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: {
        section: 'catalog_orders',
        operation: 'update',
        kind,
        order_id: orderId,
      },
      request,
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; kind: string; orderId: string } }
) {
  try {
    const encounterId = parsePositiveId(params.id, 'encounter id')
    const orderId = parsePositiveId(params.orderId, 'order id')
    const kind = parseCatalogOrderKind(params.kind)
    const { user, role } = await requireClinicalEditor()
    const admin = await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)
    await assertEncounterOrdersEditable(admin, encounterId)

    const config = CATALOG_ORDER_CONFIG[kind]
    await requireExistingOrder(admin, config.table, encounterId, orderId)

    const { error } = await admin
      .from(config.table)
      .delete()
      .eq('id', orderId)
      .eq('encounter_id', encounterId)
    if (error) throw error

    auditPhi({
      user,
      role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: {
        section: 'catalog_orders',
        operation: 'delete',
        kind,
        order_id: orderId,
      },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
