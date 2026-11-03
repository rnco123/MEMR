import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocationScope } from '@/lib/locations/scope'
import { fetchUserLocationsMap, scopeAllowsAnyLocation } from '@/lib/locations/scope'

export type AvailableDoctorRow = {
  id: number
  user_id: string
  full_name: string
  email: string | null
  specialty: string | null
  is_available: boolean
  /** profiles.role: doctor, fnp or pa. */
  role: string | null
}

/**
 * Providers (doctor / FNP / PA) a nurse can assign at their locations. Unavailable
 * providers are included (available first) so FNP/PA are never hidden from the list.
 */
export async function loadAssignableDoctors(
  admin: SupabaseClient,
  scope: LocationScope
): Promise<AvailableDoctorRow[]> {
  const { data: doctorsData, error: doctorsError } = await admin
    .from('doctors')
    .select('id, user_id, full_name, email, specialty')
    .order('full_name', { ascending: true })

  if (doctorsError) throw doctorsError
  if (!doctorsData?.length) return []

  // Match on the admin-assigned locations (user_locations), not the single
  // home location_id — a provider works at every clinic the admin assigned.
  const locationsByUser = await fetchUserLocationsMap(
    admin,
    doctorsData.map((d) => d.user_id as string)
  )

  const scopedDoctors = doctorsData.filter((d) =>
    scopeAllowsAnyLocation(scope, locationsByUser.get(d.user_id as string) ?? [])
  )

  if (scopedDoctors.length === 0) return []

  const doctorIds = scopedDoctors.map((d) => d.id)
  const userIds = scopedDoctors.map((d) => d.user_id as string)
  const [
    { data: availabilityData, error: availabilityError },
    { data: profilesByUid, error: uidError },
    { data: profilesById, error: idError },
  ] = await Promise.all([
    admin.from('doctor_availability').select('doctor_id, is_available').in('doctor_id', doctorIds),
    admin.from('profiles').select('uid, role').in('uid', userIds),
    admin.from('profiles').select('id, role').in('id', userIds),
  ])

  if (availabilityError) throw availabilityError
  if (uidError) throw uidError
  if (idError) throw idError

  const roleByUserId = new Map<string, string>()
  for (const row of profilesByUid ?? []) {
    if (row.uid && row.role) roleByUserId.set(row.uid as string, row.role as string)
  }
  for (const row of profilesById ?? []) {
    if (row.id && row.role && !roleByUserId.has(row.id as string)) {
      roleByUserId.set(row.id as string, row.role as string)
    }
  }

  return scopedDoctors
    .map((doctor) => {
      const availability = availabilityData?.find((a) => a.doctor_id === doctor.id)
      return {
        id: doctor.id,
        user_id: doctor.user_id as string,
        full_name: doctor.full_name as string,
        email: (doctor.email as string | null) ?? null,
        specialty: (doctor.specialty as string | null) ?? null,
        is_available: availability?.is_available ?? false,
        role: roleByUserId.get(doctor.user_id as string) ?? null,
      }
    })
    .sort((a, b) => Number(b.is_available) - Number(a.is_available))
}
