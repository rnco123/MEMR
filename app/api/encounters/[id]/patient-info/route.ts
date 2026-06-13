import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { patientInfoSaveSchema, type PatientInfoSaveInput } from '@/lib/validation'
import {
  assertClinicalPatientInfoRole,
  assertPatientInfoViewerRole,
  loadEncounterPatientInfoContext,
  saveEncounterPatientInfo,
  type PatientInfoUpdatePayload,
} from '@/lib/encounter/encounter-patient-info'

export const dynamic = 'force-dynamic'

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

function normalizePayload(input: PatientInfoSaveInput): PatientInfoUpdatePayload {
  const emptyToNull = (v: string | null | undefined) => {
    if (v == null || v === '') return null
    return v.trim() || null
  }
  return {
    first_name: input.first_name,
    last_name: input.last_name,
    email: emptyToNull(input.email),
    phone: emptyToNull(input.phone),
    gender: emptyToNull(input.gender),
    date_of_birth: emptyToNull(input.date_of_birth),
    street_address: emptyToNull(input.street_address),
    state: emptyToNull(input.state),
    zip_code: emptyToNull(input.zip_code),
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    assertPatientInfoViewerRole(roleInfo?.role)

    const admin = createAdminClient()
    const ctx = await loadEncounterPatientInfoContext(admin, encounterId)

    return NextResponse.json({
      patient: ctx.patient,
      last_audit: ctx.last_audit,
      editable: ctx.editable,
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const role = roleInfo?.role
    assertClinicalPatientInfoRole(role)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = patientInfoSaveSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = createAdminClient()
    const result = await saveEncounterPatientInfo(admin, {
      encounterId,
      userId: user.id,
      userEmail: user.email,
      role: role!,
      payload: normalizePayload(parsed.data),
    })

    return NextResponse.json({
      success: true,
      patient: result.patient,
      last_audit: result.last_audit,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
