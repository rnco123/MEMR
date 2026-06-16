/**
 * Audit logging API endpoint (for client-side audit events)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'
import type { AuditAction, ResourceType } from '@/lib/audit'

// Explicit enum sets for validation — prevents forgery of arbitrary action/resource strings (H-12b).
const VALID_AUDIT_ACTIONS = new Set<string>([
  'patient_viewed', 'patient_created', 'patient_updated', 'patient_deleted',
  'document_uploaded', 'document_viewed', 'document_deleted',
  'appointment_created', 'appointment_updated', 'appointment_cancelled',
  'encounter_created', 'encounter_updated',
  'vitals_recorded', 'vitals_viewed',
  'user_logged_in', 'user_logged_out', 'user_created', 'user_deleted', 'user_updated',
  'role_changed', 'password_changed',
  'data_exported', 'data_imported',
  'settings_changed', 'page_view', 'button_click', 'form_submitted', 'pdf_exported',
  'i693_action', 'i693_viewed', 'i693_saved', 'i693_ai_filled',
  'i693_pdf_exported', 'i693_workflow_updated',
])

const VALID_RESOURCE_TYPES = new Set<string>([
  'patient', 'document', 'appointment', 'encounter', 'vitals',
  'user', 'profile', 'system', 'i693',
])

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return handleApiError(new AuthenticationError())
    }

    // Parse request body
    const body = await request.json()
    const { action, resource_type, resource_id, metadata, page_url } = body

    if (!action || !resource_type) {
      return handleApiError(new ValidationError('Missing required fields: action, resource_type'))
    }

    // H-12b: Validate against known enum values to prevent arbitrary string injection.
    if (!VALID_AUDIT_ACTIONS.has(action)) {
      return handleApiError(new ValidationError(`Invalid audit action: ${action}`))
    }
    if (!VALID_RESOURCE_TYPES.has(resource_type)) {
      return handleApiError(new ValidationError(`Invalid resource_type: ${resource_type}`))
    }

    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Fetch user profile snapshot for richer audit trail
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, role')
      .eq('uid', user.id)
      .maybeSingle()

    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_name: profile?.full_name ?? null,
      user_email: profile?.email ?? user.email ?? null,
      user_role: profile?.role ?? null,
      action: action as AuditAction,
      resource_type: resource_type as ResourceType,
      resource_id: resource_id?.toString() || null,
      ip_address: ipAddress?.split(',')[0]?.trim() || 'unknown',
      user_agent: userAgent,
      metadata: metadata || null,
      page_url: page_url || null,
    })

    if (error) {
      return handleApiError(error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
