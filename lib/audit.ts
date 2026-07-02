/**
 * Audit logging types and client helper.
 * This file must stay client-safe (no next/headers, no server-only imports),
 * because it is imported from client components like the auth context.
 */

export type AuditAction =
  | 'patient_viewed'
  | 'patient_created'
  | 'patient_updated'
  | 'patient_deleted'
  | 'document_uploaded'
  | 'document_viewed'
  | 'document_deleted'
  | 'appointment_created'
  | 'appointment_updated'
  | 'appointment_cancelled'
  | 'encounter_created'
  | 'encounter_updated'
  | 'encounter_viewed'
  | 'vitals_recorded'
  | 'vitals_viewed'
  | 'prescription_created'
  | 'prescription_updated'
  | 'prescription_deleted'
  | 'prescription_viewed'
  | 'video_session_started'
  | 'user_logged_in'
  | 'user_logged_out'
  | 'user_created'
  | 'user_deleted'
  | 'role_changed'
  | 'data_exported'
  | 'data_imported'
  | 'settings_changed'
  | 'page_view'
  | 'button_click'
  | 'form_submitted'
  | 'pdf_exported'
  | 'i693_action'
  | 'i693_viewed'
  | 'i693_saved'
  | 'i693_ai_filled'
  | 'i693_pdf_exported'
  | 'i693_workflow_updated'
  | 'user_updated'
  | 'password_changed'

export type ResourceType =
  | 'patient'
  | 'document'
  | 'appointment'
  | 'encounter'
  | 'vitals'
  | 'user'
  | 'profile'
  | 'system'
  | 'i693'
  | 'prescription'

interface AuditLogMetadata {
  [key: string]: any
}

/**
 * Log audit event from client-side (for client components)
 */
export async function logAuditEventClient(
  action: AuditAction,
  resourceType: ResourceType,
  resourceId?: string | number,
  metadata?: AuditLogMetadata
): Promise<void> {
  try {
    await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata,
        page_url: typeof window !== 'undefined' ? window.location.href : undefined,
      }),
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error logging audit event from client:', error)
    }
  }
}
