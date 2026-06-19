import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { logAuditEvent } from '@/lib/audit-server'
import { sendPrescriptionsToPharmacyEmail } from '@/lib/email/send-prescription-to-pharmacy'
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

const sendToPharmacySchema = z.object({
  prescription_ids: z.array(z.number().int().positive()).min(1).max(50),
})

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = sendToPharmacySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const result = await sendPrescriptionsToPharmacyEmail({
      supabase,
      encounterId,
      prescriptionIds: parsed.data.prescription_ids,
      senderEmail: user.email,
      sentByUserId: user.id,
    })

    await logAuditEvent('form_submitted', 'encounter', encounterId, {
      action: 'prescription_emailed_to_pharmacy',
      pharmacy_email: result.pharmacyEmail,
      pharmacy_id: result.pharmacyId,
      prescription_count: result.prescriptionCount,
      resend_message_id: result.messageId,
      sent_at: result.sentAt,
      doctor_name: result.doctorName,
      clinic_name: result.clinicName,
    })

    return NextResponse.json({
      success: true,
      data: {
        message_id: result.messageId,
        pharmacy_email: result.pharmacyEmail,
        pharmacy_id: result.pharmacyId,
        prescription_count: result.prescriptionCount,
        sent_at: result.sentAt,
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
