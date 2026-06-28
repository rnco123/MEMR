import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import { canEditClinicalEncounterContent } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const preSalesRowSchema = z.object({
  product_id: z.number().int().positive(),
  product_quantity: z.number().int().positive(),
})

const preSalesBodySchema = z.object({
  rows: z.array(preSalesRowSchema).min(1).max(50),
})

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!canEditClinicalEncounterContent(roleInfo?.role)) {
      throw new AuthorizationError('Clinical staff only')
    }

    await guardEncounterAccess(user.id, encounterId)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pre_sales')
      .select('id, product_id, product_quantity, product_quantity_taken, status')
      .eq('encounter_id', encounterId)

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!canEditClinicalEncounterContent(roleInfo?.role)) {
      throw new AuthorizationError('Clinical staff only')
    }

    await guardEncounterAccess(user.id, encounterId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = preSalesBodySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = createAdminClient()
    const rows = parsed.data.rows.map((r) => ({
      encounter_id: encounterId,
      product_id: r.product_id,
      product_quantity: r.product_quantity,
      product_quantity_taken: 0,
      status: 'initiated' as const,
    }))

    const { data, error } = await admin
      .from('pre_sales')
      .insert(rows)
      .select('id, product_id, product_quantity')

    if (error) throw error
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}
