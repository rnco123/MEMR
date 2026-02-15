/**
 * Audit logging utility for HIPAA compliance
 * Logs all user actions for compliance and security
 */

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

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
  | 'vitals_recorded'
  | 'vitals_viewed'
  | 'user_logged_in'
  | 'user_logged_out'
  | 'user_created'
  | 'role_changed'
  | 'data_exported'
  | 'data_imported'
  | 'settings_changed'

export type ResourceType =
  | 'patient'
  | 'document'
  | 'appointment'
  | 'encounter'
  | 'vitals'
  | 'user'
  | 'profile'
  | 'system'

interface AuditLogMetadata {
  [key: string]: any
}

/**
 * Log an audit event
 */
export async function logAuditEvent(
  action: AuditAction,
  resourceType: ResourceType,
  resourceId?: string | number,
  metadata?: AuditLogMetadata
): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Get request headers for IP and user agent
    const headersList = await headers()
    const ipAddress =
      headersList.get('x-forwarded-for') ||
      headersList.get('x-real-ip') ||
      headersList.get('cf-connecting-ip') ||
      'unknown'
    const userAgent = headersList.get('user-agent') || 'unknown'

    // Insert audit log
    const { error } = await supabase.from('audit_logs').insert({
      user_id: user?.id || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId?.toString() || null,
      ip_address: ipAddress?.split(',')[0]?.trim() || 'unknown', // Take first IP if multiple
      user_agent: userAgent,
      metadata: metadata || null,
    })

    if (error) {
      // Don't throw - audit logging failures shouldn't break the app
      // But log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to log audit event:', error)
      }
    }
  } catch (error) {
    // Silently fail - audit logging should never break the application
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in audit logging:', error)
    }
  }
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata,
      }),
    })
  } catch (error) {
    // Silently fail
    if (process.env.NODE_ENV === 'development') {
      console.error('Error logging audit event from client:', error)
    }
  }
}
