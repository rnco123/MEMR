import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole, fetchProfileFields } from '@/lib/fetch-user-role'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'

import { guardEncounterAccess } from '@/lib/encounters/guard'
import { CLINICAL_STAFF_ROLE_SET } from '@/lib/roles'
export const dynamic = 'force-dynamic'

const CLINICAL_ROLES = CLINICAL_STAFF_ROLE_SET

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
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
    if (!roleInfo?.role || !CLINICAL_ROLES.has(roleInfo.role)) {
      throw new AuthorizationError('Doctors and nurses only')
    }

    await guardEncounterAccess(user.id, encounterId)


    const admin = createAdminClient()

    const { data: lastRow, error: lastError } = await admin
      .from('pharm_email_log')
      .select('id, sent_at, sent_by, doctor_name')
      .eq('encounter_id', encounterId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastError) throw lastError

    const { count, error: countError } = await admin
      .from('pharm_email_log')
      .select('id', { count: 'exact', head: true })
      .eq('encounter_id', encounterId)

    if (countError) throw countError

    if (!lastRow) {
      return NextResponse.json({ data: null })
    }

    let sentByName: string | null = null
    if (lastRow.sent_by) {
      const profile = await fetchProfileFields(admin, String(lastRow.sent_by), 'full_name, email')
      sentByName = (profile?.full_name as string | null)?.trim() || null
    }
    if (!sentByName) {
      sentByName = (lastRow.doctor_name as string | null)?.trim() || null
    }

    return NextResponse.json({
      data: {
        sent_at: lastRow.sent_at as string,
        sent_by_name: sentByName,
        send_count: count ?? 0,
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
