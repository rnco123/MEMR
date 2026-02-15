/**
 * Audit logging API endpoint (for client-side audit events)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError, AuthenticationError } from '@/lib/api-error-handler'
import type { AuditAction, ResourceType } from '@/lib/audit'

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
    const { action, resource_type, resource_id, metadata } = body

    if (!action || !resource_type) {
      return handleApiError(new Error('Missing required fields: action, resource_type'))
    }

    // Get request headers for IP and user agent
    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Insert audit log
    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: action as AuditAction,
      resource_type: resource_type as ResourceType,
      resource_id: resource_id?.toString() || null,
      ip_address: ipAddress?.split(',')[0]?.trim() || 'unknown',
      user_agent: userAgent,
      metadata: metadata || null,
    })

    if (error) {
      return handleApiError(error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
