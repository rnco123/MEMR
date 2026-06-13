import type { SupabaseClient } from '@supabase/supabase-js'

export type PharmEmailDoctorInfo = {
  id: number | null
  name: string | null
  phone: string | null
  email: string | null
  specialty: string | null
  npi: string | null
}

export type PharmEmailClinicInfo = {
  locationId: number | null
  name: string | null
  address: string | null
  phone: string | null
  email: string | null
}

function readTenantName(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return ((value as { name?: string | null }).name ?? null) as string | null
  }
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
    return ((value[0] as { name?: string | null }).name ?? null) as string | null
  }
  return null
}

export async function resolvePharmEmailDoctorAndClinic(
  admin: SupabaseClient,
  input: {
    encounterId: number
    patientId: number
    doctorId: number | null
    appointmentId?: number | null
  }
): Promise<{ doctor: PharmEmailDoctorInfo; clinic: PharmEmailClinicInfo }> {
  let doctor: PharmEmailDoctorInfo = {
    id: input.doctorId,
    name: null,
    phone: null,
    email: null,
    specialty: null,
    npi: null,
  }

  let locationId: number | null = null

  if (input.doctorId != null) {
    const { data: doctorRow } = await admin
      .from('doctors')
      .select('id, full_name, specialty, phone, email, location_id, npi')
      .eq('id', input.doctorId)
      .maybeSingle()

    if (doctorRow) {
      doctor = {
        id: Number(doctorRow.id),
        name: (doctorRow.full_name as string | null) ?? null,
        phone: (doctorRow.phone as string | null) ?? null,
        email: (doctorRow.email as string | null) ?? null,
        specialty: (doctorRow.specialty as string | null) ?? null,
        npi: (doctorRow.npi as string | null)?.trim() || null,
      }
      if (doctorRow.location_id != null) {
        locationId = Number(doctorRow.location_id)
      }
    }
  }

  if (locationId == null) {
    const { data: patientRow } = await admin
      .from('patients')
      .select('location_id')
      .eq('id', input.patientId)
      .maybeSingle()
    if (patientRow?.location_id != null) {
      locationId = Number(patientRow.location_id)
    }
  }

  if (locationId == null && input.appointmentId != null) {
    const { data: appointmentRow } = await admin
      .from('appointments')
      .select('location_id')
      .eq('id', input.appointmentId)
      .maybeSingle()
    if (appointmentRow?.location_id != null) {
      locationId = Number(appointmentRow.location_id)
    }
  }

  let clinic: PharmEmailClinicInfo = {
    locationId,
    name: null,
    address: null,
    phone: null,
    email: null,
  }

  if (locationId != null) {
    const { data: locationRow } = await admin
      .from('locations')
      .select('id, title, address, phone, email, tenants:tenant_id (name)')
      .eq('id', locationId)
      .maybeSingle()

    if (locationRow) {
      const tenantName = readTenantName(locationRow.tenants)
      const title = (locationRow.title as string | null) ?? null
      clinic = {
        locationId: Number(locationRow.id),
        name: title || tenantName,
        address: (locationRow.address as string | null) ?? null,
        phone: (locationRow.phone as string | null) ?? null,
        email: (locationRow.email as string | null) ?? null,
      }
    }
  }

  return { doctor, clinic }
}
