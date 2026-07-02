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
}

export async function loadAvailableDoctors(
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
  const { data: availabilityData, error: availabilityError } = await admin
    .from('doctor_availability')
    .select('doctor_id, is_available')
    .in('doctor_id', doctorIds)

  if (availabilityError) throw availabilityError

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
      }
    })
    .filter((d) => d.is_available)
}
