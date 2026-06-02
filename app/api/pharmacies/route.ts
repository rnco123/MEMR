import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { pharmacyCreateSchema } from '@/lib/validation'
import { requirePharmacyAdminUser } from '@/lib/pharmacy-keys'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MAX_PAGE_SIZE = 100

function normalizePharmacyRow(p: Record<string, unknown>) {
  const normalizedPhone = (p.phone ?? p.phone_number ?? null) as string | null
  const fallbackAddress = [p.city, p.state, p.zip_code].filter(Boolean).join(', ')
  const normalizedAddress = (p.address ?? (fallbackAddress || null)) as string | null
  return {
    id: p.id as number,
    name: (p.name as string | null) ?? null,
    address: normalizedAddress,
    phone: normalizedPhone,
    email: (p.email as string | null) ?? null,
    created_at: p.created_at as string,
    updated_at: p.updated_at as string,
  }
}

export async function GET(req: NextRequest) {
  try {
    await requirePharmacyAdminUser()
    const admin = createAdminClient()

    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') || '20'))
    )
    const search = (req.nextUrl.searchParams.get('search') || '').trim()
    const contactFilter = req.nextUrl.searchParams.get('contactFilter') || 'all'
    const sortBy = req.nextUrl.searchParams.get('sort') || 'updated_desc'

    let query = admin
      .from('pharmacy')
      .select('id, name, address, city, state, zip_code, phone_number, phone, email, created_at, updated_at', {
        count: 'exact',
      })

    if (search) {
      const term = `%${search}%`
      const num = parseInt(search, 10)
      if (!Number.isNaN(num)) {
        query = query.or(`name.ilike.${term},address.ilike.${term},phone.ilike.${term},email.ilike.${term},id.eq.${num}`)
      } else {
        query = query.or(`name.ilike.${term},address.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
      }
    }

    if (contactFilter === 'with-contact') {
      query = query.or('phone.not.is.null,phone_number.not.is.null,email.not.is.null')
    } else if (contactFilter === 'missing-contact') {
      query = query.is('phone', null).is('phone_number', null).is('email', null)
    }

    if (sortBy === 'name_asc') {
      query = query.order('name', { ascending: true, nullsFirst: false })
    } else if (sortBy === 'name_desc') {
      query = query.order('name', { ascending: false, nullsFirst: false })
    } else {
      query = query.order('updated_at', { ascending: false })
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const { data: pharmacies, error: phErr, count } = await query.range(from, to)

    if (phErr) throw phErr

    const data = (pharmacies ?? []).map((p) => normalizePharmacyRow(p as Record<string, unknown>))

    return NextResponse.json({
      data,
      total: count ?? data.length,
      page,
      pageSize,
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requirePharmacyAdminUser()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = pharmacyCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    const { data, error } = await supabase
      .from('pharmacy')
      .insert({
        name: v.name,
        address: v.address ?? null,
        phone: v.phone ?? null,
        phone_number: v.phone ?? null,
        email: v.email ?? null,
      })
      .select('id, name, address, phone, email, created_at, updated_at')
      .single()

    if (error) throw error
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
