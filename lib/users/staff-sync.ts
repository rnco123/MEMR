import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPhysicianRole, type AdminStaffRoleValue } from '@/lib/roles'

/**
 * Staff-record and location-assignment writes shared by Admin → Users
 * (app/api/admin/users) and Clinic manager → Staff (app/api/manage/staff).
 */

export async function syncStaffRecord(
  admin: ReturnType<typeof createAdminClient>,
  uid: string,
  role: AdminStaffRoleValue,
  fullName: string,
  email: string | null,
  options?: { primaryLocationId?: number | null; npi?: string | null }
) {
  const locationPatch =
    options && 'primaryLocationId' in options
      ? { location_id: options.primaryLocationId ?? null }
      : {}
  const npiPatch = options && 'npi' in options ? { npi: options.npi ?? null } : {}

  if (isPhysicianRole(role)) {
    const { data: existing } = await admin.from('doctors').select('id').eq('user_id', uid).maybeSingle()
    const payload = {
      full_name: fullName,
      email,
      ...locationPatch,
      ...npiPatch,
    }
    if (existing) {
      const { error } = await admin.from('doctors').update(payload).eq('user_id', uid)
      if (error) throw error
    } else {
      const { error } = await admin.from('doctors').insert({ user_id: uid, ...payload })
      if (error) throw error
    }
  } else {
    const { data: existing } = await admin.from('nurses').select('id').eq('user_id', uid).maybeSingle()
    const payload = {
      full_name: fullName,
      is_active: true,
      ...locationPatch,
    }
    if (existing) {
      const { error } = await admin.from('nurses').update(payload).eq('user_id', uid)
      if (error) throw error
    } else {
      const { error } = await admin.from('nurses').insert({ user_id: uid, ...payload })
      if (error) throw error
    }
  }
}

export async function syncUserLocations(
  admin: ReturnType<typeof createAdminClient>,
  uid: string,
  locationIds: number[]
) {
  await admin.from('user_locations').delete().eq('user_uid', uid)
  if (locationIds.length === 0) return
  const { error } = await admin.from('user_locations').insert(
    locationIds.map((lid) => ({
      user_uid: uid,
      profile_id: uid,
      location_id: lid,
    }))
  )
  if (error) throw error
}

