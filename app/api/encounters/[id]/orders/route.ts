import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encounterOrderCreateSchema } from '@/lib/validation'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'
import { getDoctorRowId } from '@/lib/clinical'
import { guardEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/guard'
import { loadEncounterOrders } from '@/lib/clinical/load-encounter-orders'
import { ENCOUNTER_ORDER_SELECT } from '@/lib/encounters/encounter-detail-selects'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    await guardEncounterAccess(user.id, encounterId)

    const data = await loadEncounterOrders(supabase, encounterId)
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = encounterOrderCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const { data: enc, error: encErr } = await supabase
      .from('encounters')
      .select('id, patient_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr) throw encErr
    if (!enc) throw new ValidationError('Encounter not found')

    // H-08d: always derive prescriber from session — ignore client-supplied doctor id.
    const orderedBy = await getDoctorRowId(supabase, user.id)

    const { data, error } = await supabase
      .from('encounter_orders')
      .insert({
        encounter_id: encounterId,
        patient_id: enc.patient_id,
        ordered_by_doctor_id: orderedBy,
        order_type: parsed.data.order_type,
        title: parsed.data.title,
        instructions: parsed.data.instructions ?? null,
        status: 'pending',
      })
      .select(ENCOUNTER_ORDER_SELECT)
      .single()

    if (error) throw error

    auditPhi({
      user,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'orders', order_type: parsed.data.order_type },
      request,
    })

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
