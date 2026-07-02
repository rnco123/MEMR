import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { physicalExaminationPatchSchema } from '@/lib/validation'
import {
  loadEncounterPhysicalExamination,
  saveEncounterPhysicalExamination,
} from '@/lib/encounter/physical-examination-store'
import { normalizePhysicalExamination, normalizeRosExamData } from '@/lib/encounter/physical-examination'
import { assertEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/assert-access'
import { resolveEncounterWriteAllowed } from '@/lib/encounters/access-helpers'
import { CLINICAL_STAFF_WITH_ADMIN_ROLE_SET, mapRoleToEnum } from '@/lib/roles'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

const VIEWER_ROLES = CLINICAL_STAFF_WITH_ADMIN_ROLE_SET

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
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
    if (!role || !VIEWER_ROLES.has(role)) {
      throw new AuthorizationError()
    }

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId)

    const result = await loadEncounterPhysicalExamination(admin, encounterId, { role })
    const { data: encounterRow } = await admin
      .from('encounters')
      .select('doctor_id')
      .eq('id', encounterId)
      .maybeSingle()
    const mappedRole = mapRoleToEnum(role)
    const canWrite =
      mappedRole != null
        ? await resolveEncounterWriteAllowed(admin, user.id, mappedRole, {
            doctor_id: encounterRow?.doctor_id,
          })
        : false

    auditPhi({
      user,
      role,
      action: 'encounter_viewed',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'physical_examination' },
      request,
    })

    return NextResponse.json({ success: true, ...result, editable: canWrite && result.editable })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
    if (!role || !VIEWER_ROLES.has(role)) {
      throw new AuthorizationError()
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = physicalExaminationPatchSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId, ENCOUNTER_WRITE_ACCESS)

    const result = await saveEncounterPhysicalExamination(admin, {
      encounterId,
      userId: user.id,
      userEmail: user.email,
      role,
      payload: normalizePhysicalExamination(parsed.data.physical_examination),
      rosExam: parsed.data.ros_exam ? normalizeRosExamData(parsed.data.ros_exam) : undefined,
    })

    auditPhi({
      user,
      role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'physical_examination' },
      request,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return handleApiError(e)
  }
}
