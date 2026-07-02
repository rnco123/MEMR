import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requirePharmacyAdminUser } from '@/lib/pharmacy-keys'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  pharmacy_id: z.coerce.number().int().positive(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  include_cancelled: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
})

export async function GET(request: Request) {
  try {
    const { user } = await requirePharmacyAdminUser()
    const admin = createAdminClient()

    const url = new URL(request.url)
    const parsed = querySchema.safeParse({
      pharmacy_id: url.searchParams.get('pharmacy_id'),
      since: url.searchParams.get('since') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      include_cancelled: url.searchParams.get('include_cancelled') ?? undefined,
    })
    if (!parsed.success) throw new ValidationError('Invalid query params', { issues: parsed.error.issues })

    const pharmacyId = parsed.data.pharmacy_id
    const baseColumns = `
      id,
      patient_id,
      encounter_id,
      medication_name,
      dosage,
      instructions,
      quantity,
      refills,
      status,
      external_rx_id,
      notes,
      created_at,
      updated_at
    `

    const fetchByEncounterPharmacy = async (): Promise<Array<Record<string, unknown>>> => {
      const { data: encounterRows, error: encounterErr } = await admin
        .from('encounters')
        .select('id')
        .eq('pharmacy_id', pharmacyId)
        .limit(5000)
      if (encounterErr) throw encounterErr

      const encounterIds = (encounterRows ?? [])
        .map((r: { id?: number | string }) => Number(r.id))
        .filter((id) => Number.isFinite(id))

      if (encounterIds.length === 0) return []

      let q = admin
        .from('prescriptions')
        .select(baseColumns)
        .in('encounter_id', encounterIds)
        .order('created_at', { ascending: true })
        .limit(parsed.data.limit)

      if (!parsed.data.include_cancelled) q = q.neq('status', 'cancelled')
      if (parsed.data.since) q = q.gte('created_at', parsed.data.since)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        pharmacy_id: pharmacyId,
        pharmacy_pulled_at: null,
      }))
    }

    const isMissingPharmacyColumnOnPrescriptions = (err: { code?: string; message?: string } | null) => {
      if (!err) return false
      const msg = (err.message || '').toLowerCase()
      if (msg.includes('pharmacy_id') && msg.includes('prescriptions')) return true
      if (msg.includes('pharmacy_pulled_at') && msg.includes('prescriptions')) return true
      if (err.code === 'PGRST204' && msg.includes('pharmacy')) return true
      if (err.code === '42703' && (msg.includes('pharmacy_id') || msg.includes('pharmacy_pulled_at'))) return true
      return false
    }

    let query = admin
      .from('prescriptions')
      .select(baseColumns)
      .eq('pharmacy_id', pharmacyId)
      .order('created_at', { ascending: true })
      .limit(parsed.data.limit)

    if (!parsed.data.include_cancelled) query = query.neq('status', 'cancelled')
    if (parsed.data.since) query = query.gte('created_at', parsed.data.since)

    let prescriptions: Array<Record<string, unknown>> = []
    const firstTry = await query
    if (!firstTry.error) {
      prescriptions = ((firstTry.data as Array<Record<string, unknown>>) ?? []).map((row) => ({
        ...row,
        pharmacy_id: pharmacyId,
        pharmacy_pulled_at: null,
      }))
    } else if (isMissingPharmacyColumnOnPrescriptions(firstTry.error as { code?: string; message?: string })) {
      prescriptions = await fetchByEncounterPharmacy()
    } else {
      throw firstTry.error
    }

    if (prescriptions.length === 0) {
      const viaEncounter = await fetchByEncounterPharmacy()
      prescriptions = viaEncounter
    }

    if (prescriptions.length > 0) {
      const nowIso = new Date().toISOString()
      const ids = prescriptions.map((p) => p.id)

      await admin
        .from('prescriptions')
        .update({
          pharmacy_pulled_at: nowIso,
          updated_at: nowIso,
        })
        .in('id', ids)
        .is('pharmacy_pulled_at', null)

      await admin
        .from('prescriptions')
        .update({
          status: 'sent',
          updated_at: nowIso,
        })
        .in('id', ids)
        .eq('status', 'recorded')
    }

    // Bulk prescription pull destined for an external pharmacy — record the disclosure.
    auditPhi({
      user,
      role: user.role,
      action: 'data_exported',
      resourceType: 'prescription',
      resourceId: pharmacyId,
      metadata: { destination: 'pharmacy', pharmacy_id: pharmacyId, count: prescriptions.length },
      request,
    })

    return NextResponse.json({
      success: true,
      pharmacy_id: pharmacyId,
      count: prescriptions.length,
      data: prescriptions,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
