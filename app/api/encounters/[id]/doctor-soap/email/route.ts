import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { logAuditEvent } from '@/lib/audit-server'
import { sendSoapNoteToPatient } from '@/lib/email/send-soap-to-patient'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

const CLINICAL_ROLES = new Set(['doctor', 'nurse', 'staff'])

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
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

    const result = await sendSoapNoteToPatient({
      supabase,
      encounterId,
      senderEmail: user.email,
    })

    await logAuditEvent('form_submitted', 'encounter', encounterId, {
      action: 'soap_emailed_to_patient',
      patient_email: result.patientEmail,
      resend_message_id: result.messageId,
      sent_at: result.sentAt,
    })

    return NextResponse.json({
      success: true,
      data: {
        message_id: result.messageId,
        patient_email: result.patientEmail,
        sent_at: result.sentAt,
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
