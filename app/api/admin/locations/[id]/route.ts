import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, NotFoundError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { revalidateCache } from '@/lib/cache'
import { logAuditEvent } from '@/lib/audit-server'
import { resolveGoogleMapUrl, normalizeEmail, normalizePhone } from '@/lib/locations/format'
import {
  LOCATION_ADMIN_SELECT,
  normalizeAdminLocationRow,
} from '@/lib/locations/admin-row'
import { locationUpdateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw new ValidationError('Invalid location id')
  }
  return id
}

async function assertActiveTenant(admin: SupabaseClient, tenantId: number): Promise<void> {
  const { data, error } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new ValidationError('Invalid tenant')
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminUser()
    const locationId = parseId(params.id)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('locations')
      .select(LOCATION_ADMIN_SELECT)
      .eq('id', locationId)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new NotFoundError('Location not found')

    return NextResponse.json({
      data: normalizeAdminLocationRow(data as Record<string, unknown>),
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const locationId = parseId(params.id)
    const admin = createAdminClient()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = locationUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const { data: existing, error: existingError } = await admin
      .from('locations')
      .select(LOCATION_ADMIN_SELECT)
      .eq('id', locationId)
      .maybeSingle()

    if (existingError) throw existingError
    if (!existing) throw new NotFoundError('Location not found')

    const v = parsed.data
    if (v.tenant_id != null) {
      await assertActiveTenant(admin, v.tenant_id)
    }

    const nextAddress = v.address !== undefined ? v.address : (existing.address as string | null)
    const nextMapInput =
      v.google_map_url !== undefined ? v.google_map_url : (existing.google_map_url as string | null)

    const mapFieldsChanged = v.google_map_url !== undefined || v.address !== undefined
    const mapResult = mapFieldsChanged ? resolveGoogleMapUrl(nextMapInput, nextAddress) : null
    if (mapResult && !mapResult.valid) {
      throw new ValidationError('Invalid Google Maps link')
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (v.title !== undefined) patch.title = v.title.trim()
    if (v.tenant_id !== undefined) patch.tenant_id = v.tenant_id
    if (v.address !== undefined) patch.address = v.address
    if (v.phone !== undefined) patch.phone = normalizePhone(v.phone)
    if (v.email !== undefined) patch.email = normalizeEmail(v.email ?? null)
    if (v.opening_hours !== undefined) patch.opening_hours = v.opening_hours
    if (v.is_active !== undefined) patch.is_active = v.is_active
    if (v.location_group !== undefined) patch.location_group = v.location_group?.trim() || null

    if (mapResult) {
      patch.google_map_url = mapResult.url
    }

    const { data, error } = await admin
      .from('locations')
      .update(patch)
      .eq('id', locationId)
      .select(LOCATION_ADMIN_SELECT)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new NotFoundError('Location not found')

    await revalidateCache('locations')
    await logAuditEvent('settings_changed', 'system', locationId, {
      action:
        v.is_active === false
          ? 'location_disabled'
          : v.is_active === true
            ? 'location_enabled'
            : 'location_updated',
      title: data.title,
      tenant_id: v.tenant_id ?? existing.tenant_id,
      actor_id: user.id,
    })

    const normalized = normalizeAdminLocationRow(data as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: normalized,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
