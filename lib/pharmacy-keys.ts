/**
 * Helpers shared by pharmacy management API routes.
 *
 * These keep `pharmacy_api_keys.key_hash` as the only stored secret form
 * (raw key is shown to the operator exactly once) and centralize the
 * "is the caller a clinical user with rights to manage pharmacies" gate.
 */

import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { createClient } from '@/lib/supabase/server'

export const CLINICAL_ROLES = new Set(['doctor', 'nurse', 'staff'])

export type ClinicalUser = {
  id: string
  role: string
}

export async function requireClinicalUser(): Promise<{
  supabase: SupabaseClient
  user: ClinicalUser
}> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new AuthenticationError()
  }

  const roleInfo = await fetchUserRole(supabase, user.id)
  const role = roleInfo?.role ?? ''
  if (!CLINICAL_ROLES.has(role)) {
    throw new AuthorizationError('Pharmacy management is restricted to clinical staff')
  }

  return { supabase: supabase as unknown as SupabaseClient, user: { id: user.id, role } }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/**
 * Generate a `pharm_live_<48 hex>` API key.
 *
 * The first 18 chars (`pharm_live_<6 hex>`) are stored unhashed as `key_prefix`
 * so operators can recognize a key in lists without ever seeing the secret.
 */
export function generatePharmacyApiKey(): {
  rawKey: string
  prefix: string
  hash: string
} {
  const random = randomBytes(24).toString('hex')
  const rawKey = `pharm_live_${random}`
  const prefix = rawKey.slice(0, 18)
  const hash = sha256Hex(rawKey)
  return { rawKey, prefix, hash }
}

export function parsePharmacyId(value: string | undefined | null): number {
  const id = Number(value)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pharmacy id')
  }
  return id
}
