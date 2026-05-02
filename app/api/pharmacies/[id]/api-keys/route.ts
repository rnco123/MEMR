import { NextResponse } from 'next/server'
import { handleApiError, NotFoundError, ValidationError } from '@/lib/api-error-handler'
import { pharmacyApiKeyCreateSchema } from '@/lib/validation'
import { generatePharmacyApiKey, requireClinicalUser } from '@/lib/pharmacy-keys'

export const dynamic = 'force-dynamic'

function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw new ValidationError('Invalid pharmacy id')
  }
  return id
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const pharmacyId = parseId(params.id)
    const { supabase } = await requireClinicalUser()

    const { data: pharmacy, error: pErr } = await supabase
      .from('pharmacy')
      .select('id')
      .eq('id', pharmacyId)
      .maybeSingle()
    if (pErr) throw pErr
    if (!pharmacy) throw new NotFoundError('Pharmacy not found')

    const { data, error } = await supabase
      .from('pharmacy_api_keys')
      .select('id, key_name, key_prefix, is_active, last_used_at, expires_at, created_at, updated_at')
      .eq('pharmacy_id', pharmacyId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const pharmacyId = parseId(params.id)
    const { supabase } = await requireClinicalUser()

    const { data: pharmacy, error: pErr } = await supabase
      .from('pharmacy')
      .select('id')
      .eq('id', pharmacyId)
      .maybeSingle()
    if (pErr) throw pErr
    if (!pharmacy) throw new NotFoundError('Pharmacy not found')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = pharmacyApiKeyCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error
    const v = parsed.data

    if (v.expires_at && new Date(v.expires_at).getTime() <= Date.now()) {
      throw new ValidationError('expires_at must be in the future')
    }

    const { rawKey, prefix, hash } = generatePharmacyApiKey()

    const { data, error } = await supabase
      .from('pharmacy_api_keys')
      .insert({
        pharmacy_id: pharmacyId,
        key_name: v.key_name,
        key_prefix: prefix,
        key_hash: hash,
        is_active: true,
        expires_at: v.expires_at ?? null,
      })
      .select('id, key_name, key_prefix, is_active, last_used_at, expires_at, created_at, updated_at')
      .single()

    if (error) throw error

    // Raw key is returned exactly once. After this response, only the
    // SHA-256 hash exists in the database.
    return NextResponse.json({
      success: true,
      data,
      raw_key: rawKey,
      warning: 'Save this key now. It will not be shown again.',
    })
  } catch (e) {
    return handleApiError(e)
  }
}
