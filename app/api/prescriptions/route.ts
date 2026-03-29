import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prescriptionCreateSchema } from '@/lib/validation'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { getDoctorRowId } from '@/lib/clinical'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (roleInfo?.role !== 'doctor') throw new AuthorizationError('Doctors only')

    const doctorId = await getDoctorRowId(supabase, user.id)
    if (!doctorId) {
      return NextResponse.json({ data: [], message: 'No doctor profile linked to this account' })
    }

    const { data, error } = await supabase
      .from('prescriptions')
      .select(
        `
        id,
        patient_id,
        encounter_id,
        medication_name,
        dosage,
        instructions,
        quantity,
        refills,
        status,
        external_rx_id,
        notes,
        created_at,
        updated_at,
        patients:patient_id ( first_name, last_name )
      `
      )
      .eq('prescriber_doctor_id', doctorId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (roleInfo?.role !== 'doctor') throw new AuthorizationError('Doctors only')

    const doctorId = await getDoctorRowId(supabase, user.id)
    if (!doctorId) throw new ValidationError('Complete your doctor profile before prescribing')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = prescriptionCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    if (v.encounter_id != null) {
      const { data: enc } = await supabase
        .from('encounters')
        .select('id, patient_id')
        .eq('id', v.encounter_id)
        .maybeSingle()
      if (!enc) throw new ValidationError('Encounter not found')
      if (Number(enc.patient_id) !== v.patient_id) {
        throw new ValidationError('Patient does not match this encounter')
      }
    }

    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        prescriber_doctor_id: doctorId,
        patient_id: v.patient_id,
        encounter_id: v.encounter_id ?? null,
        medication_name: v.medication_name,
        dosage: v.dosage ?? null,
        instructions: v.instructions ?? null,
        quantity: v.quantity ?? null,
        refills: v.refills ?? 0,
        status: v.status ?? 'recorded',
        external_rx_id: v.external_rx_id ?? null,
        notes: v.notes ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
