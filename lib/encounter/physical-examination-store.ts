import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import {
  PHYSICAL_EXAM_ROW_SELECT,
  canEditPhysicalExamination,
  normalizePhysicalExamination,
  normalizeRosExamData,
  physicalExamAuditFromRow,
  physicalExaminationDataToRow,
  physicalExaminationFromLegacyFindings,
  physicalExaminationRowToData,
  type PhysicalExamAuditSummary,
  type PhysicalExaminationData,
  type RosExamData,
} from '@/lib/encounter/physical-examination'

export async function loadEncounterPhysicalExamination(
  admin: SupabaseClient,
  encounterId: number,
  args?: { legacyFindings?: string | null; role?: string | null; encounterStatus?: string | null }
) {
  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select('id, status, ma_exam_findings')
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')

  const status = args?.encounterStatus ?? (encounter.status as string)
  const legacyFindings =
    args?.legacyFindings ?? (encounter.ma_exam_findings as string | null | undefined)

  const { data: row, error: rowErr } = await admin
    .from('encounter_physical_examinations')
    .select(PHYSICAL_EXAM_ROW_SELECT)
    .eq('encounter_id', encounterId)
    .maybeSingle()

  if (rowErr) throw rowErr

  let physical_examination = physicalExaminationRowToData(
    (row as Record<string, unknown> | null) ?? null
  )
  if (Object.keys(physical_examination).length === 0) {
    physical_examination = physicalExaminationFromLegacyFindings(legacyFindings)
  }

  const ros_exam = normalizeRosExamData(
    (row as Record<string, unknown> | null)?.ros_exam_data ?? null
  )

  return {
    physical_examination,
    ros_exam,
    last_audit: physicalExamAuditFromRow((row as Record<string, unknown> | null) ?? null),
    editable: canEditPhysicalExamination(status, args?.role),
    status,
  }
}

export async function saveEncounterPhysicalExamination(
  admin: SupabaseClient,
  args: {
    encounterId: number
    userId: string
    userEmail?: string | null
    role: string
    payload: PhysicalExaminationData
    rosExam?: RosExamData
  }
) {
  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select('id, status')
    .eq('id', args.encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')

  if (!canEditPhysicalExamination(encounter.status as string, args.role)) {
    throw new ValidationError(
      'Physical examination can only be edited from appointment initiated through in consultation'
    )
  }

  const profile = await fetchProfileFields(admin, args.userId, 'full_name, email', {
    email: args.userEmail,
  })
  const editorName =
    (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
    (typeof profile?.email === 'string' && profile.email) ||
    args.userEmail ||
    'Unknown'

  const now = new Date().toISOString()
  const examFields = physicalExaminationDataToRow(normalizePhysicalExamination(args.payload))

  const { data: saved, error: saveErr } = await admin
    .from('encounter_physical_examinations')
    .upsert(
      {
        encounter_id: args.encounterId,
        ...examFields,
        ...(args.rosExam !== undefined ? { ros_exam_data: args.rosExam } : {}),
        edited_by: args.userId,
        editor_role: args.role,
        editor_name: editorName,
        updated_at: now,
      },
      { onConflict: 'encounter_id' }
    )
    .select(PHYSICAL_EXAM_ROW_SELECT)
    .single()

  if (saveErr) throw saveErr

  await admin
    .from('encounters')
    .update({ updated_at: now })
    .eq('id', args.encounterId)

  const savedRow = saved as Record<string, unknown>
  return {
    physical_examination: physicalExaminationRowToData(savedRow),
    ros_exam: normalizeRosExamData(savedRow.ros_exam_data ?? null),
    last_audit: {
      editor_name: editorName,
      editor_role: args.role,
      updated_at: String(savedRow.updated_at ?? now),
      recorded_at: savedRow.created_at ? String(savedRow.created_at) : null,
    } satisfies NonNullable<PhysicalExamAuditSummary>,
    editable: canEditPhysicalExamination(encounter.status as string, args.role),
  }
}
