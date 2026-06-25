import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserRole } from '@/lib/fetch-user-role'
import type { PhysicianReviewStatus } from './physician-review'

const AUDIT_DOCUMENTING_ROLES = new Set(['fnp', 'pa'])

export function requiresPhysicianAudit(role: string | null | undefined): boolean {
  if (!role) return false
  return AUDIT_DOCUMENTING_ROLES.has(role.trim().toLowerCase())
}

type DocumentingProvider = {
  userId: string
  role: string
  displayName: string | null
}

/** Resolve FNP/PA documenting provider from encounter assignment (doctors.user_id). */
export async function resolveDocumentingProvider(
  admin: SupabaseClient,
  encounterId: number
): Promise<DocumentingProvider | null> {
  const { data: encounter, error } = await admin
    .from('encounters')
    .select(`
      documenting_user_id,
      doctor_id,
      doctors ( user_id, full_name )
    `)
    .eq('id', encounterId)
    .maybeSingle()

  if (error) throw error
  if (!encounter) return null

  const doctor = Array.isArray(encounter.doctors)
    ? encounter.doctors[0]
    : encounter.doctors
  const assignedUserId =
    (doctor as { user_id?: string | null } | null | undefined)?.user_id ?? null
  const assignedName =
    (doctor as { full_name?: string | null } | null | undefined)?.full_name?.trim() ?? null

  const candidates = [
    encounter.documenting_user_id,
    assignedUserId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0)

  for (const userId of candidates) {
    const roleInfo = await fetchUserRole(admin, userId)
    if (requiresPhysicianAudit(roleInfo?.role)) {
      return {
        userId,
        role: roleInfo!.role,
        displayName: assignedName,
      }
    }
  }

  return null
}

/**
 * When an FNP/PA finishes encounter documentation, ensure audit row exists.
 * Uses encounter doctor assignment when the acting user is not the documenter.
 */
export async function ensureEncounterPhysicianReview(
  admin: SupabaseClient,
  args: {
    encounterId: number
    documentingUserId: string
    documentingRole: string | null | undefined
  }
): Promise<{ created: boolean; reviewStatus: PhysicianReviewStatus | null }> {
  const resolved = await resolveDocumentingProvider(admin, args.encounterId)

  let documentingUserId = resolved?.userId ?? null
  let documentingRole = resolved?.role ?? null

  if (!documentingUserId && requiresPhysicianAudit(args.documentingRole)) {
    documentingUserId = args.documentingUserId
    documentingRole = args.documentingRole!.trim().toLowerCase()
  }

  if (!documentingUserId || !requiresPhysicianAudit(documentingRole)) {
    return { created: false, reviewStatus: null }
  }

  const { data: encounter, error: encError } = await admin
    .from('encounters')
    .select('id, patient_id, documenting_user_id')
    .eq('id', args.encounterId)
    .maybeSingle()

  if (encError) throw encError
  if (!encounter?.patient_id) {
    return { created: false, reviewStatus: null }
  }

  if (encounter.documenting_user_id !== documentingUserId) {
    const { error: docError } = await admin
      .from('encounters')
      .update({ documenting_user_id: documentingUserId })
      .eq('id', args.encounterId)
    if (docError) throw docError
  }

  const { data: existing, error: existingError } = await admin
    .from('encounter_physician_reviews')
    .select('id, review_status')
    .eq('encounter_id', args.encounterId)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) {
    return {
      created: false,
      reviewStatus: existing.review_status as PhysicianReviewStatus,
    }
  }

  const now = new Date().toISOString()
  const { error: insertError } = await admin.from('encounter_physician_reviews').insert({
    encounter_id: args.encounterId,
    patient_id: encounter.patient_id,
    documenting_user_id: documentingUserId,
    review_status: 'pending',
    created_at: now,
    updated_at: now,
  })

  if (insertError) throw insertError
  return { created: true, reviewStatus: 'pending' }
}
