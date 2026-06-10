import { NextResponse } from 'next/server'
import { handleApiError, NotFoundError, ValidationError } from '@/lib/api-error-handler'
import { pharmacyUpdateSchema } from '@/lib/validation'
import { requirePharmacyAdminUser } from '@/lib/pharmacy-keys'
import { createAdminClient } from '@/lib/supabase/admin'

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
    await requirePharmacyAdminUser()
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('pharmacy')
      .select('id, name, address, phone, email, created_at, updated_at')
      .eq('id', pharmacyId)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new NotFoundError('Pharmacy not found')

    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const pharmacyId = parseId(params.id)
    await requirePharmacyAdminUser()
    const admin = createAdminClient()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = pharmacyUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (v.name !== undefined) patch.name = v.name
    if (v.address !== undefined) patch.address = v.address ?? null
    if (v.phone !== undefined) {
      patch.phone = v.phone ?? null
      patch.phone_number = v.phone ?? null
    }
    if (v.email !== undefined) patch.email = v.email ?? null

    const { data, error } = await admin
      .from('pharmacy')
      .update(patch)
      .eq('id', pharmacyId)
      .select('id, name, address, phone, email, created_at, updated_at')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new NotFoundError('Pharmacy not found')

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const pharmacyId = parseId(params.id)
    await requirePharmacyAdminUser()
    const admin = createAdminClient()

    // FKs are ON DELETE SET NULL on encounters.pharmacy_id and prescriptions.pharmacy_id.
    const { error } = await admin.from('pharmacy').delete().eq('id', pharmacyId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
