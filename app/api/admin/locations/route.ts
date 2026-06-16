import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { revalidateCache } from '@/lib/cache'
import { logAuditEvent } from '@/lib/audit-server'
import { resolveGoogleMapUrl, normalizeEmail, normalizePhone } from '@/lib/locations/format'
import {
  LOCATION_ADMIN_SELECT,
  normalizeAdminLocationRow,
} from '@/lib/locations/admin-row'
import { locationCreateSchema } from '@/lib/validation'
import { syncLocationCreateToExternal } from '@/lib/locations/external-sync'
import { sanitizePatientSearchTerm } from '@/lib/nurse/patient-search-query'

export const dynamic = 'force-dynamic'

const MAX_PAGE_SIZE = 100

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

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') || '20'))
    )
    const search = sanitizePatientSearchTerm((req.nextUrl.searchParams.get('search') || '').trim())
    const statusFilter = req.nextUrl.searchParams.get('status') || 'all'
    const sortBy = req.nextUrl.searchParams.get('sort') || 'title_asc'
    const tenantFilter = Number(req.nextUrl.searchParams.get('tenant_id') || '0')

    let query = admin.from('locations').select(LOCATION_ADMIN_SELECT, { count: 'exact' })

    if (Number.isFinite(tenantFilter) && tenantFilter > 0) {
      query = query.eq('tenant_id', tenantFilter)
    }

    if (search) {
      const term = `%${search}%`
      const num = parseInt(search, 10)
      if (!Number.isNaN(num)) {
        query = query.or(
          `title.ilike.${term},address.ilike.${term},location_code.ilike.${term},phone.ilike.${term},email.ilike.${term},id.eq.${num}`
        )
      } else {
        query = query.or(
          `title.ilike.${term},address.ilike.${term},location_code.ilike.${term},phone.ilike.${term},email.ilike.${term}`
        )
      }
    }

    if (statusFilter === 'active') {
      query = query.eq('is_active', true)
    } else if (statusFilter === 'inactive') {
      query = query.eq('is_active', false)
    }

    if (sortBy === 'title_desc') {
      query = query.order('title', { ascending: false, nullsFirst: false })
    } else if (sortBy === 'updated_desc') {
      query = query.order('updated_at', { ascending: false, nullsFirst: false })
    } else {
      query = query.order('title', { ascending: true, nullsFirst: false })
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const { data, error, count } = await query.range(from, to)
    if (error) throw error

    const rows = (data ?? []).map((row) =>
      normalizeAdminLocationRow(row as Record<string, unknown>)
    )

    return NextResponse.json({
      data: rows,
      total: count ?? rows.length,
      page,
      pageSize,
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminUser()
    const admin = createAdminClient()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = locationCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    if (v.tenant_id != null) {
      await assertActiveTenant(admin, v.tenant_id)
    }

    const mapResult = resolveGoogleMapUrl(v.google_map_url, v.address)
    if (!mapResult.valid) {
      throw new ValidationError('Invalid Google Maps link')
    }

    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('locations')
      .insert({
        title: v.title.trim(),
        tenant_id: v.tenant_id ?? null,
        address: v.address ?? null,
        phone: normalizePhone(v.phone),
        email: normalizeEmail(v.email ?? null),
        opening_hours: v.opening_hours ?? null,
        google_map_url: mapResult.url,
        is_active: v.is_active ?? true,
        updated_at: now,
      })
      .select(LOCATION_ADMIN_SELECT)
      .single()

    if (error) throw error

    await revalidateCache('locations')
    await logAuditEvent('settings_changed', 'system', data.id, {
      action: 'location_created',
      title: data.title,
      tenant_id: v.tenant_id,
      actor_id: user.id,
    })

    const normalized = normalizeAdminLocationRow(data as Record<string, unknown>)
    const externalSync = await syncLocationCreateToExternal(admin, {
      id: normalized.id,
      title: normalized.title,
      tenant_id: normalized.tenant_id,
      location_code: normalized.location_code,
      address: normalized.address,
      phone: normalized.phone,
      email: normalized.email,
      opening_hours: normalized.opening_hours,
      google_map_url: normalized.google_map_url,
      is_active: normalized.is_active,
    })

    if (externalSync && !externalSync.ok) {
      console.error('[locations] external sync failed on create:', externalSync.error)
    }

    const { data: linked } = await admin
      .from('locations')
      .select(LOCATION_ADMIN_SELECT)
      .eq('id', normalized.id)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      data: normalizeAdminLocationRow((linked ?? data) as Record<string, unknown>),
      external_sync: externalSync,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
