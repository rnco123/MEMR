import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { canEditClinicalEncounterContent } from '@/lib/roles'
import { guardEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/guard'
import {
  assertEncounterOrdersEditable,
  CATALOG_ORDER_CONFIG,
  parsePositiveId,
} from '@/lib/orders/catalog-orders'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

const createBodySchema = z.object({
  kind: z.enum(['lab', 'medication']),
  rows: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().int().positive().max(999),
      })
    )
    .min(1)
    .max(50),
})

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new AuthenticationError()

  const roleInfo = await fetchUserRole(supabase, user.id)
  return { supabase, user, role: roleInfo?.role ?? null }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parsePositiveId(params.id, 'encounter id')
    const { user, role } = await requireUser()
    if (!canEditClinicalEncounterContent(role)) throw new AuthorizationError()

    const admin = await guardEncounterAccess(user.id, encounterId)
    const [labsResult, medicationsResult] = await Promise.all([
      admin
        .from(CATALOG_ORDER_CONFIG.lab.table)
        .select(CATALOG_ORDER_CONFIG.lab.select)
        .eq('encounter_id', encounterId)
        .order('created_at', { ascending: true }),
      admin
        .from(CATALOG_ORDER_CONFIG.medication.table)
        .select(CATALOG_ORDER_CONFIG.medication.select)
        .eq('encounter_id', encounterId)
        .order('created_at', { ascending: true }),
    ])

    if (labsResult.error) throw labsResult.error
    if (medicationsResult.error) throw medicationsResult.error

    auditPhi({
      user,
      role,
      action: 'encounter_viewed',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'catalog_orders' },
      request,
    })

    return NextResponse.json({
      labs: labsResult.data ?? [],
      medications: medicationsResult.data ?? [],
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parsePositiveId(params.id, 'encounter id')
    const { user, role } = await requireUser()
    if (!canEditClinicalEncounterContent(role)) {
      throw new AuthorizationError('Clinical staff only')
    }

    const admin = await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)
    await assertEncounterOrdersEditable(admin, encounterId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }
    const parsed = createBodySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const config = CATALOG_ORDER_CONFIG[parsed.data.kind]
    const productIds = [...new Set(parsed.data.rows.map((row) => row.product_id))]
    const { data: products, error: productError } = await admin
      .from(config.productTable)
      .select('id')
      .in('id', productIds)
    if (productError) throw productError
    if ((products ?? []).length !== productIds.length) {
      throw new ValidationError('One or more selected products no longer exist')
    }

    const insertRows = parsed.data.rows.map((row) => ({
      encounter_id: encounterId,
      [config.productColumn]: row.product_id,
      qty: row.qty,
    }))
    const { data, error } = await admin
      .from(config.table)
      .insert(insertRows)
      .select(config.select)
    if (error) throw error

    auditPhi({
      user,
      role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: {
        section: 'catalog_orders',
        operation: 'create',
        kind: parsed.data.kind,
        count: insertRows.length,
        order_ids: (data ?? []).map((row) => Number(row.id)),
      },
      request,
    })

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error) {
    return handleApiError(error)
  }
}
