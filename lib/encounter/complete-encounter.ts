import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { ensureEncounterPhysicianReview } from '@/lib/compliance/ensure-physician-review'
import type { EncounterStatus } from '@/lib/encounter-status'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  ENCOUNTER_I693_ELIGIBILITY_SELECT,
  isImmigrationEncounterForI693,
} from '@/lib/i693/immigration-eligibility'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'

/** Statuses from which a doctor may mark the encounter completed (nurse final review skipped). */
const DOCTOR_COMPLETE_FROM: EncounterStatus[] = ['in_consultation', 'consultation_concluded', 'final_review']

export function canDoctorCompleteEncounter(
  status: string | null | undefined,
  options: { isI693?: boolean } = {}
): boolean {
  if (!status) return false
  if (options.isI693 && status === 'vitals_assessed') return true
  return DOCTOR_COMPLETE_FROM.includes(status as EncounterStatus)
}

export async function completeEncounter(
  admin: SupabaseClient,
  args: { encounterId: number; userId: string }
): Promise<{ status: 'completed' }> {
  const { data: encounter, error } = await admin
    .from('encounters')
    .select(`status, ${ENCOUNTER_I693_ELIGIBILITY_SELECT}`)
    .eq('id', args.encounterId)
    .maybeSingle()

  if (error) throw error
  if (!encounter) throw new ValidationError('Encounter not found')

  const isI693 = isImmigrationEncounterForI693(encounter)
  if (!canDoctorCompleteEncounter(encounter.status as string, { isI693 })) {
    throw new ValidationError(
      'Encounter must be in final review, or be an I-693 encounter with vitals assessed, before it can be completed'
    )
  }

  const { error: updateError } = await admin
    .from('encounters')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.encounterId)

  if (updateError) throw updateError

  const profileId = await getProfileId(admin, args.userId)
  await insertStatusTimeline(admin, {
    encounterId: args.encounterId,
    status: 'completed',
    profileId,
  })

  const roleInfo = await fetchUserRole(admin, args.userId)
  await ensureEncounterPhysicianReview(admin, {
    encounterId: args.encounterId,
    documentingUserId: args.userId,
    documentingRole: roleInfo?.role ?? null,
  })

  return { status: 'completed' }
}
