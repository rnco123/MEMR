import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  canEditClinicalEncounterContent,
  canViewClinicalEncounterContent,
} from '@/lib/roles'
import { guardEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/guard'
import { auditPhi } from '@/lib/audit-phi'
import {
  assertDiagnosisEncounterEditable,
  includesDiagnosisId,
  parseDiagnosisId,
} from '@/lib/diagnoses/validation'

export const dynamic = 'force-dynamic'

const createDiagnosisSchema = z.union([
  z.object({ diagnosis_id: z.number().int().positive() }),
  z.object({
    diagnosis_ids: z.array(z.number().int().positive()).min(1).max(25),
  }),
])

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new AuthenticationError()

  const roleInfo = await fetchUserRole(supabase, user.id)
  return { supabase, user, role: roleInfo?.role ?? null }
}

async function assertDiagnosesEditable(
  admin: Awaited<ReturnType<typeof guardEncounterAccess>>,
  encounterId: number
) {
  const { data, error } = await admin
    .from('encounters')
    .select('id, status')
    .eq('id', encounterId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Encounter not found')
  assertDiagnosisEncounterEditable(data.status)
}

const DIAGNOSIS_SELECT =
  'id, encounter_id, diagnosis_id, created_at, updated_at, diagnosis:diagnosis_id(id, icd_code, description)'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseDiagnosisId(params.id, 'encounter id')
    const { user, role } = await requireUser()
    if (!canViewClinicalEncounterContent(role)) throw new AuthorizationError('Clinical staff only')

    const admin = await guardEncounterAccess(user.id, encounterId)
    const { data, error } = await admin
      .from('encounter_diagnoses')
      .select(DIAGNOSIS_SELECT)
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true })
    if (error) throw error

    auditPhi({
      user,
      role,
      action: 'encounter_viewed',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'diagnoses' },
      request,
    })

    return NextResponse.json({ diagnoses: data ?? [] })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseDiagnosisId(params.id, 'encounter id')
    const { user, role } = await requireUser()
    if (!canEditClinicalEncounterContent(role)) {
      throw new AuthorizationError('Clinical staff only')
    }

    const admin = await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)
    await assertDiagnosesEditable(admin, encounterId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }
    const parsed = createDiagnosisSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const diagnosisIds =
      'diagnosis_ids' in parsed.data
        ? [...new Set(parsed.data.diagnosis_ids)]
        : [parsed.data.diagnosis_id]
    const isBatch = 'diagnosis_ids' in parsed.data

    const { data: catalogDiagnoses, error: diagnosisError } = await admin
      .from('all_diagnoses')
      .select('id')
      .in('id', diagnosisIds)
    if (diagnosisError) throw diagnosisError
    if ((catalogDiagnoses ?? []).length !== diagnosisIds.length) {
      throw new NotFoundError('One or more diagnoses were not found')
    }

    const { data: existing, error: existingError } = await admin
      .from('encounter_diagnoses')
      .select('id, diagnosis_id')
      .eq('encounter_id', encounterId)
    if (existingError) throw existingError
    if (diagnosisIds.some((diagnosisId) => includesDiagnosisId(existing ?? [], diagnosisId))) {
      throw new ConflictError('One or more diagnoses are already added to this encounter')
    }

    const { data, error } = await admin
      .from('encounter_diagnoses')
      .insert(diagnosisIds.map((diagnosisId) => ({
        encounter_id: encounterId,
        diagnosis_id: diagnosisId,
      })))
      .select(DIAGNOSIS_SELECT)
    if (error) {
      if (error.code === '23505') {
        throw new ConflictError('One or more diagnoses are already added to this encounter')
      }
      throw error
    }
    const createdRows = data ?? []

    auditPhi({
      user,
      role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: {
        section: 'diagnoses',
        operation: 'create',
        encounter_diagnosis_ids: createdRows.map((row) => Number(row.id)),
        diagnosis_ids: diagnosisIds,
      },
      request,
    })

    return NextResponse.json(
      { success: true, data: isBatch ? createdRows : createdRows[0] },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
