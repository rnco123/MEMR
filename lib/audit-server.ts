/**
 * Server-side audit logging helper.
 * Only import this from server code (API routes, server components).
 */

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import type { AuditAction, ResourceType } from './audit'

interface AuditLogMetadata {
  [key: string]: any
}

export async function logAuditEvent(
  action: AuditAction,
  resourceType: ResourceType,
  resourceId?: string | number,
  metadata?: AuditLogMetadata
): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const headersList = await headers()
    const ipAddress =
      headersList.get('x-forwarded-for') ||
      headersList.get('x-real-ip') ||
      headersList.get('cf-connecting-ip') ||
      'unknown'
    const userAgent = headersList.get('user-agent') || 'unknown'
    const pageUrl = headersList.get('referer') || headersList.get('x-pathname') || null

    let userName: string | null = null
    let userEmail: string | null = user?.email ?? null
    let userRole: string | null = null
    if (user?.id) {
      const profile = await fetchProfileFields(
        supabase,
        user.id,
        'full_name, email, role',
        { email: user.email }
      )
      userName = (profile?.full_name as string | null) ?? null
      userEmail = (profile?.email as string | null) ?? userEmail
      userRole = (profile?.role as string | null) ?? null
    }

    const { error } = await supabase.from('audit_logs').insert({
      user_id: user?.id || null,
      user_name: userName,
      user_email: userEmail,
      user_role: userRole,
      action,
      resource_type: resourceType,
      resource_id: resourceId?.toString() || null,
      ip_address: ipAddress?.split(',')[0]?.trim() || 'unknown',
      user_agent: userAgent,
      page_url: pageUrl,
      metadata: metadata || null,
    })

    if (error && process.env.NODE_ENV === 'development') {
      console.error('Failed to log audit event:', error)
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in audit logging:', error)
    }
  }
}

