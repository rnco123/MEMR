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
    const { action, resource_type, resource_id, metadata, page_url } = body

    if (!action || !resource_type) {
      return handleApiError(new Error('Missing required fields: action, resource_type'))
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
