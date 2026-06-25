import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { pharmacyRegistryCreateSchema } from '@/lib/validation'
import { loadEncounterForRx } from '@/lib/prescriptions/encounter-prescriptions'
import { normalizePharmacyRow } from '@/lib/pharmacies/normalize'
import { canManageEncounterPharmacy } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!canManageEncounterPharmacy(roleInfo?.role)) {
      throw new AuthorizationError('Doctors and nurses only')
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = pharmacyRegistryCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    const admin = createAdminClient()

    if (v.assign_to_encounter_id != null) {
      await loadEncounterForRx(admin, v.assign_to_encounter_id)
    }

    const { data, error } = await admin
      .from('pharmacy')
      .insert({
        name: v.name,
        address: v.address ?? null,
        phone: v.phone ?? null,
        phone_number: v.phone ?? null,
        email: v.email ?? null,
        is_active: true,
      })
      .select('id, name, address, city, state, zip_code, phone, phone_number, email')
      .single()

    if (error) throw error

    let encounterAssigned = false
    if (v.assign_to_encounter_id != null) {
      const { error: assignError } = await admin
        .from('encounters')
        .update({
          pharmacy_id: data.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', v.assign_to_encounter_id)

      if (assignError) throw assignError
      encounterAssigned = true
    }

    return NextResponse.json({
      success: true,
      data: normalizePharmacyRow(data as Record<string, unknown>),
      encounter_assigned: encounterAssigned,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
