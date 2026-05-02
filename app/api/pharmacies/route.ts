import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { pharmacyCreateSchema } from '@/lib/validation'
import { requireClinicalUser } from '@/lib/pharmacy-keys'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requireClinicalUser()

    const { data: pharmacies, error: phErr } = await supabase
      .from('pharmacy')
      .select('id, name, address, phone, email, created_at, updated_at')
      .order('name', { ascending: true })

    if (phErr) throw phErr

    const ids = (pharmacies ?? [])
      .map((p) => Number(p.id))
      .filter((n) => Number.isFinite(n))

    const keyCounts = new Map<number, { active: number; total: number }>()
    if (ids.length > 0) {
      const { data: keys, error: keyErr } = await supabase
        .from('pharmacy_api_keys')
        .select('pharmacy_id, is_active, expires_at')
        .in('pharmacy_id', ids)

      // Table may not exist on older DBs; surface 0/0 instead of failing the list.
      if (!keyErr) {
        const now = Date.now()
        for (const k of keys ?? []) {
          const pid = Number(k.pharmacy_id)
          if (!Number.isFinite(pid)) continue
          const slot = keyCounts.get(pid) ?? { active: 0, total: 0 }
          slot.total += 1
          const expired = k.expires_at && new Date(k.expires_at).getTime() <= now
          if (k.is_active && !expired) slot.active += 1
          keyCounts.set(pid, slot)
        }
      }
    }

    const data = (pharmacies ?? []).map((p) => {
      const counts = keyCounts.get(Number(p.id)) ?? { active: 0, total: 0 }
      return {
        ...p,
        active_key_count: counts.active,
        total_key_count: counts.total,
      }
    })

    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireClinicalUser()

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
        email: v.email ?? null,
      })
      .select('id, name, address, phone, email, created_at, updated_at')
      .single()

    if (error) throw error
    return NextResponse.json({
      success: true,
      data: { ...data, active_key_count: 0, total_key_count: 0 },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
