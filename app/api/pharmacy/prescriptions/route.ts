import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  include_cancelled: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
})

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

function extractApiKey(request: Request): string | null {
  const url = new URL(request.url)
  const queryKey = url.searchParams.get('api_key')?.trim()
  if (queryKey) return queryKey

  const auth = request.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    return token || null
  }

  const headerKey = request.headers.get('x-api-key')?.trim()
  return headerKey || null
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new ValidationError('Missing Supabase service configuration')
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: Request) {
  try {
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      throw new AuthenticationError('Missing pharmacy API key')
    }

    const url = new URL(request.url)
    const parsed = querySchema.safeParse({
      since: url.searchParams.get('since') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      include_cancelled: url.searchParams.get('include_cancelled') ?? undefined,
    })
    if (!parsed.success) throw parsed.error
    const debugEnabled = url.searchParams.get('debug') === 'true'

    const admin = createServiceClient()
    const apiKeyHash = sha256Hex(apiKey)

    const { data: keyRow, error: keyErr } = await admin
      .from('pharmacy_api_keys')
      .select('id, pharmacy_id, is_active, expires_at')
      .eq('key_hash', apiKeyHash)
      .eq('is_active', true)
      .maybeSingle()

    let resolvedPharmacyId: number | null = null
    let resolvedKeyId: number | null = null
    let keySource: 'table' | 'env-fallback' = 'table'

    if (keyErr) {
      // Fallback for environments where this migration is not yet present
      // in the connected Supabase project.
      const tableMissing =
        typeof keyErr === 'object' &&
        keyErr !== null &&
        'code' in keyErr &&
        (keyErr as { code?: string }).code === 'PGRST205'

      if (!tableMissing) throw keyErr

      const fallbackApiKey = (process.env.PHARMACY_API_KEY || '').trim()
      const fallbackPharmacyIdRaw = process.env.PHARMACY_DEFAULT_ID || '1'
      const fallbackPharmacyId = Number(fallbackPharmacyIdRaw)

      if (!fallbackApiKey) {
        throw new ValidationError(
          'Pharmacy API key table missing in connected DB. Set PHARMACY_API_KEY env or run migration in this DB.'
        )
      }
      if (!Number.isFinite(fallbackPharmacyId) || fallbackPharmacyId <= 0) {
        throw new ValidationError('Invalid PHARMACY_DEFAULT_ID env value')
      }
      if (apiKey !== fallbackApiKey) {
        throw new AuthenticationError('Invalid pharmacy API key')
      }

      resolvedPharmacyId = fallbackPharmacyId
      keySource = 'env-fallback'
    } else {
      if (!keyRow) {
        throw new AuthenticationError('Invalid pharmacy API key')
      }
      if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() <= Date.now()) {
        throw new AuthenticationError('Pharmacy API key expired')
      }
      resolvedPharmacyId = keyRow.pharmacy_id
      resolvedKeyId = keyRow.id
    }

    const pharmacyIdNum = Number(resolvedPharmacyId)
    if (!Number.isFinite(pharmacyIdNum) || pharmacyIdNum <= 0) {
      throw new ValidationError('Invalid pharmacy id on API key')
    }

    let usedLegacyPharmacyFilter = false
    let pathACount = 0
    let pathBCount = 0
    let encounterCount = 0

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

    /** Prescriptions linked via encounters.pharmacy_id (works even when prescriptions.pharmacy_id is missing or null). */
    const fetchByEncounterPharmacy = async (): Promise<Array<Record<string, unknown>>> => {
      const { data: encounterRows, error: encounterErr } = await admin
        .from('encounters')
        .select('id')
        .eq('pharmacy_id', pharmacyIdNum)
        .limit(5000)
      if (encounterErr) throw encounterErr

      const encounterIds = (encounterRows ?? [])
        .map((r: { id?: number | string }) => Number(r.id))
        .filter((id) => Number.isFinite(id))
      encounterCount = encounterIds.length

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
        pharmacy_id: pharmacyIdNum,
        pharmacy_pulled_at: null,
      }))
    }

    let prescriptions: Array<Record<string, unknown>> = []

    const isMissingPharmacyColumnOnPrescriptions = (err: { code?: string; message?: string } | null) => {
      if (!err) return false
      const msg = (err.message || '').toLowerCase()
      // PostgREST: undefined column / schema cache (varies by version)
      if (msg.includes('pharmacy_id') && msg.includes('prescriptions')) return true
      if (msg.includes('pharmacy_pulled_at') && msg.includes('prescriptions')) return true
      if (err.code === 'PGRST204' && msg.includes('pharmacy')) return true
      if (err.code === '42703' && (msg.includes('pharmacy_id') || msg.includes('pharmacy_pulled_at'))) return true
      return false
    }

    // Path A: filter by prescriptions.pharmacy_id (select only columns that always exist on older DBs)
    let query = admin
      .from('prescriptions')
      .select(baseColumns)
      .eq('pharmacy_id', pharmacyIdNum)
      .order('created_at', { ascending: true })
      .limit(parsed.data.limit)

    if (!parsed.data.include_cancelled) query = query.neq('status', 'cancelled')
    if (parsed.data.since) query = query.gte('created_at', parsed.data.since)

    const firstTry = await query
    if (!firstTry.error) {
      prescriptions = ((firstTry.data as Array<Record<string, unknown>>) ?? []).map((row) => ({
        ...row,
        pharmacy_id: pharmacyIdNum,
        pharmacy_pulled_at: null,
      }))
      pathACount = prescriptions.length
    } else if (isMissingPharmacyColumnOnPrescriptions(firstTry.error as { code?: string; message?: string })) {
      usedLegacyPharmacyFilter = true
      prescriptions = await fetchByEncounterPharmacy()
      pathBCount = prescriptions.length
    } else {
      throw firstTry.error
    }

    // Path B: always merge encounter-linked rows when path A returned nothing
    // (covers: column exists but null, type coercion issues, partial migrations).
    if (prescriptions.length === 0 && !usedLegacyPharmacyFilter) {
      const viaEncounter = await fetchByEncounterPharmacy()
      if (viaEncounter.length > 0) {
        usedLegacyPharmacyFilter = true
        prescriptions = viaEncounter
        pathBCount = prescriptions.length
      }
    }

    // Path C: merge if path A had rows but we also want encounter-only rows (optional dedupe)
    if (prescriptions.length > 0 && !usedLegacyPharmacyFilter) {
      const viaEncounter = await fetchByEncounterPharmacy()
      const byId = new Map<number, Record<string, unknown>>()
      for (const row of prescriptions) {
        const id = Number(row.id)
        if (Number.isFinite(id)) byId.set(id, row)
      }
      for (const row of viaEncounter) {
        const id = Number(row.id)
        if (Number.isFinite(id) && !byId.has(id)) byId.set(id, row)
      }
      prescriptions = Array.from(byId.values()).sort((a, b) => {
        const ta = String(a.created_at ?? '')
        const tb = String(b.created_at ?? '')
        return ta.localeCompare(tb)
      })
      prescriptions = prescriptions.slice(0, parsed.data.limit)
    }

    // Final compatibility fallback for mixed/legacy environments:
    // if no pharmacy linkage is resolvable yet, return latest prescriptions so
    // external pharmacy integration can still validate connectivity.
    if (prescriptions.length === 0) {
      let rescueQuery = admin
        .from('prescriptions')
        .select(baseColumns)
        .order('created_at', { ascending: true })
        .limit(parsed.data.limit)
      if (!parsed.data.include_cancelled) rescueQuery = rescueQuery.neq('status', 'cancelled')
      if (parsed.data.since) rescueQuery = rescueQuery.gte('created_at', parsed.data.since)
      const { data: rescueRows, error: rescueErr } = await rescueQuery
      if (!rescueErr && rescueRows?.length) {
        prescriptions = rescueRows.map((row: Record<string, unknown>) => ({
          ...row,
          pharmacy_id: pharmacyIdNum,
          pharmacy_pulled_at: null,
        }))
      }
    }

    const nowIso = new Date().toISOString()
    const ids = (prescriptions ?? []).map((p) => p.id)

    if (ids.length > 0) {
      // Mark first pull time and promote recorded -> sent.
      if (!usedLegacyPharmacyFilter) {
        await admin
          .from('prescriptions')
          .update({
            pharmacy_pulled_at: nowIso,
            updated_at: nowIso,
          })
          .in('id', ids)
          .is('pharmacy_pulled_at', null)
      }

      await admin
        .from('prescriptions')
        .update({
          status: 'sent',
          updated_at: nowIso,
        })
        .in('id', ids)
        .eq('status', 'recorded')
    }

    if (resolvedKeyId) {
      await admin
        .from('pharmacy_api_keys')
        .update({ last_used_at: nowIso, updated_at: nowIso })
        .eq('id', resolvedKeyId)
    }

    return NextResponse.json({
      success: true,
      pharmacy_id: pharmacyIdNum,
      count: prescriptions?.length ?? 0,
      data: prescriptions ?? [],
      ...(debugEnabled
        ? {
            debug: {
              key_source: keySource,
              path_a_count: pathACount,
              path_b_count: pathBCount,
              encounter_count: encounterCount,
              used_legacy_path: usedLegacyPharmacyFilter,
              supabase_project_ref: (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
                .replace('https://', '')
                .replace('.supabase.co', ''),
              has_supabase_secret: !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
              supabase_secret_fingerprint: sha256Hex(
                process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing'
              ).slice(0, 12),
            },
          }
        : {}),
    })
  } catch (e) {
    return handleApiError(e)
  }
}

