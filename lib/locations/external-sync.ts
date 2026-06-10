import type { SupabaseClient } from '@supabase/supabase-js'
import { createExternalAdminClient } from '@/lib/supabase/external-admin'
import { isExternalSupabaseConfigured } from '@/lib/supabase/external-keys'
import { parseOpeningHours, type DayHours } from '@/lib/locations/hours'

/** External Clinica San Miguel table (PascalCase — legacy apps depend on it). */
export const EXTERNAL_LOCATIONS_TABLE = 'Locations'

export type MemrLocationSyncInput = {
  id: number
  title: string
  tenant_id: number | null
  location_code: string | null
  address: string | null
  phone: string | null
  email: string | null
  opening_hours: string | null
  google_map_url: string | null
  is_active: boolean
  external_location_id?: number | null
}

export type ExternalSyncResult =
  | { ok: true; external_id: number }
  | { ok: false; error: string }

function formatTime12h(time24: string): string {
  const [hourText, minuteText] = time24.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time24
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

function formatDayTiming(day: DayHours): string {
  if (day.closed) return 'Closed'
  return `${formatTime12h(day.start)} - ${formatTime12h(day.end)}`
}

function buildLegacyDayTimings(openingHours: string | null) {
  const schedule = parseOpeningHours(openingHours)
  return {
    mon_timing: formatDayTiming(schedule.mon),
    tuesday_timing: formatDayTiming(schedule.tue),
    wednesday_timing: formatDayTiming(schedule.wed),
    thursday_timing: formatDayTiming(schedule.thu),
    friday_timing: formatDayTiming(schedule.fri),
    saturday_timing: formatDayTiming(schedule.sat),
    sunday_timing: formatDayTiming(schedule.sun),
  }
}

async function resolveExternalTenantId(
  primary: SupabaseClient,
  external: SupabaseClient,
  tenantId: number | null
): Promise<number | null> {
  if (tenantId == null) return null

  const { data: tenant, error } = await primary
    .from('tenants')
    .select('id, name, tenant_code, is_active')
    .eq('id', tenantId)
    .maybeSingle()

  if (error) throw error
  if (!tenant) return null

  const now = new Date().toISOString()
  const { data: upserted, error: upsertError } = await external
    .from('tenants')
    .upsert(
      {
        name: tenant.name,
        tenant_code: tenant.tenant_code,
        is_active: tenant.is_active !== false,
        updated_at: now,
      },
      { onConflict: 'tenant_code' }
    )
    .select('id')
    .single()

  if (upsertError) {
    // External PostgREST may lag behind SQL migrations (table/columns not in schema cache yet).
    console.warn('[external-sync] tenant upsert skipped:', upsertError.message)
    return null
  }
  return Number(upserted.id)
}

/** Columns exposed on legacy external `Locations` via PostgREST (safe for REST insert/update). */
function buildLegacyExternalLocationRow(input: MemrLocationSyncInput): Record<string, unknown> {
  const now = new Date().toISOString()
  const phone = (input.phone ?? '').trim() || 'N/A'
  const address = (input.address ?? '').trim() || 'N/A'
  const email = (input.email ?? '').trim() || 'contact@clinic.local'
  const direction = (input.google_map_url ?? input.address ?? '').trim() || 'N/A'
  const dayTimings = buildLegacyDayTimings(input.opening_hours)

  return {
    title: input.title.trim(),
    phone,
    direction,
    email,
    email_address: input.email ?? null,
    address,
    ...dayTimings,
    Group: input.location_code ?? `MEMR-${input.id}`,
    credit_limit: 0,
    balance: 0,
    updated_at: now,
  }
}

export async function syncTenantToExternal(tenant: {
  name: string
  tenant_code: string
  is_active?: boolean
}): Promise<ExternalSyncResult | null> {
  if (!isExternalSupabaseConfigured()) return null

  try {
    const external = createExternalAdminClient()
    const now = new Date().toISOString()
    const { data, error } = await external
      .from('tenants')
      .upsert(
        {
          name: tenant.name.trim(),
          tenant_code: tenant.tenant_code.trim(),
          is_active: tenant.is_active !== false,
          updated_at: now,
        },
        { onConflict: 'tenant_code' }
      )
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, external_id: Number(data.id) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'External tenant sync failed' }
  }
}

export async function syncLocationCreateToExternal(
  primary: SupabaseClient,
  input: MemrLocationSyncInput
): Promise<ExternalSyncResult | null> {
  if (!isExternalSupabaseConfigured()) return null

  try {
    const external = createExternalAdminClient()
    await resolveExternalTenantId(primary, external, input.tenant_id)
    const row = buildLegacyExternalLocationRow(input)

    const { data, error } = await external
      .from(EXTERNAL_LOCATIONS_TABLE)
      .insert(row)
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }

    const externalId = Number(data.id)
    const { error: linkError } = await primary
      .from('locations')
      .update({ external_location_id: externalId })
      .eq('id', input.id)

    if (linkError) {
      return {
        ok: false,
        error: `External row created (id ${externalId}) but primary link failed: ${linkError.message}`,
      }
    }

    return { ok: true, external_id: externalId }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'External location sync failed'
    console.error('[external-sync] location create failed:', message)
    return { ok: false, error: message }
  }
}

export async function syncLocationUpdateToExternal(
  primary: SupabaseClient,
  input: MemrLocationSyncInput
): Promise<ExternalSyncResult | null> {
  if (!isExternalSupabaseConfigured()) return null

  try {
    const external = createExternalAdminClient()
    await resolveExternalTenantId(primary, external, input.tenant_id)
    const row = buildLegacyExternalLocationRow(input)

    const externalId = input.external_location_id ?? null
    if (externalId != null) {
      const { data, error } = await external
        .from(EXTERNAL_LOCATIONS_TABLE)
        .update(row)
        .eq('id', externalId)
        .select('id')
        .maybeSingle()

      if (error) return { ok: false, error: error.message }
      if (data) return { ok: true, external_id: Number(data.id) }
    }

    const groupCode = input.location_code ?? `MEMR-${input.id}`
    const { data: byGroup, error: groupLookupError } = await external
      .from(EXTERNAL_LOCATIONS_TABLE)
      .select('id')
      .eq('Group', groupCode)
      .maybeSingle()

    if (groupLookupError) return { ok: false, error: groupLookupError.message }

    if (byGroup?.id) {
      const { data, error } = await external
        .from(EXTERNAL_LOCATIONS_TABLE)
        .update(row)
        .eq('id', byGroup.id)
        .select('id')
        .single()

      if (error) return { ok: false, error: error.message }

      await primary.from('locations').update({ external_location_id: data.id }).eq('id', input.id)
      return { ok: true, external_id: Number(data.id) }
    }

    return syncLocationCreateToExternal(primary, input)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'External location sync failed'
    console.error('[external-sync] location update failed:', message)
    return { ok: false, error: message }
  }
}
