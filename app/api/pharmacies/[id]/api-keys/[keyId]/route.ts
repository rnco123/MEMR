import { NextResponse } from 'next/server'
import { handleApiError, NotFoundError, ValidationError } from '@/lib/api-error-handler'
import { pharmacyApiKeyUpdateSchema } from '@/lib/validation'
import { requireClinicalUser } from '@/lib/pharmacy-keys'

export const dynamic = 'force-dynamic'

function parseId(raw: string | undefined, label: string): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw new ValidationError(`Invalid ${label}`)
  }
  return id
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; keyId: string } }
) {
  try {
    const pharmacyId = parseId(params.id, 'pharmacy id')
    const keyId = parseId(params.keyId, 'api key id')
    const { supabase } = await requireClinicalUser()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = pharmacyApiKeyUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error
    const v = parsed.data

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (v.is_active !== undefined) patch.is_active = v.is_active
    if (v.key_name !== undefined) patch.key_name = v.key_name

    const { data, error } = await supabase
      .from('pharmacy_api_keys')
      .update(patch)
      .eq('id', keyId)
      .eq('pharmacy_id', pharmacyId)
      .select('id, key_name, key_prefix, is_active, last_used_at, expires_at, created_at, updated_at')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new NotFoundError('API key not found for this pharmacy')

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; keyId: string } }
) {
  try {
    const pharmacyId = parseId(params.id, 'pharmacy id')
    const keyId = parseId(params.keyId, 'api key id')
    const { supabase } = await requireClinicalUser()

    const { error } = await supabase
      .from('pharmacy_api_keys')
      .delete()
      .eq('id', keyId)
      .eq('pharmacy_id', pharmacyId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
