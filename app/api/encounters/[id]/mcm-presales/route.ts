import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createExternalAdminClient } from '@/lib/supabase/external-admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['doctor', 'nurse', 'staff'])

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
})

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      throw new ValidationError('Invalid encounter id')
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const role = roleInfo?.role?.toLowerCase()
    if (!role || !ALLOWED_ROLES.has(role)) {
      throw new AuthorizationError('You are not allowed to sync pre-sales to MCM')
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const { data: encounter, error: encounterErr } = await supabase
      .from('encounters')
      .select('id, mcm_encounter_id, mcm_sync_status')
      .eq('id', encounterId)
      .maybeSingle()

    if (encounterErr) throw encounterErr
    if (!encounter) throw new NotFoundError('Encounter not found')
    if (!encounter.mcm_encounter_id || encounter.mcm_sync_status !== 'copied') {
      throw new ValidationError('Encounter is not mapped to MCM. Click "Copy Data to MCM" first.')
    }

    const external = createExternalAdminClient()

    const { data: extEncounter, error: extEncounterErr } = await external
      .from('encounter')
      .select('id')
      .eq('id', encounter.mcm_encounter_id)
      .maybeSingle()
    if (extEncounterErr || !extEncounter?.id) {
      throw new ValidationError('Mapped MCM encounter no longer exists. Re-copy encounter.')
    }

    const rows = parsed.data.items.map((item) => ({
      encounter_id: encounter.mcm_encounter_id,
      product_id: item.product_id,
      product_quantity: item.quantity,
      product_quantity_taken: 0,
      status: 'initiated',
    }))

    const { data: inserted, error: insertErr } = await external
      .from('pre_sales')
      .insert(rows)
      .select('id, encounter_id, product_id, product_quantity, product_quantity_taken, status, created_at')

    if (insertErr) throw insertErr

    return NextResponse.json({
      success: true,
      encounter_id: encounterId,
      mcm_encounter_id: encounter.mcm_encounter_id,
      synced_count: inserted?.length || 0,
      rows: inserted ?? [],
    })
  } catch (e) {
    return handleApiError(e)
  }
}
