import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocationScope } from '@/lib/locations/scope'
import { isAllowedByLocationScope } from '@/lib/locations/scope'

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
    .select('id, user_id, full_name, email, specialty, location_id')
    .order('full_name', { ascending: true })

  if (doctorsError) throw doctorsError
  if (!doctorsData?.length) return []

  const scopedDoctors = doctorsData.filter((d) => {
    const loc = d.location_id != null ? Number(d.location_id) : null
    return isAllowedByLocationScope(scope, loc)
  })

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
