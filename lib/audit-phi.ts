/**
 * Fast server-side PHI access audit logging (HIPAA §164.312(b)).
 *
 * Design constraints — this runs on every PHI route, so it must be invisible:
 * - Fire-and-forget: never awaited by callers, adds zero response latency.
 * - No lookups at write time: the caller passes the role it already resolved
 *   for authorization; user name enrichment happens at read time in the
 *   admin audit viewer.
 * - Single insert via the service-role client (no RLS evaluation).
 * - View dedupe: repeated reads of the same record by the same user within
 *   a 5-minute window log once (a chart open fires several sub-fetches).
 *   Writes are never deduped.
 * - Never throws: a logging failure must never fail the clinical request.
 *
 * Only import from server code (API routes).
 */

import { LRUCache } from 'lru-cache'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AuditAction, ResourceType } from '@/lib/audit'

/** Actions treated as reads — deduped within the window. */
const VIEW_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  'patient_viewed',
  'encounter_viewed',
  'document_viewed',
  'vitals_viewed',
  'prescription_viewed',
])

const VIEW_DEDUPE_WINDOW_MS = 5 * 60 * 1000

const recentViews = new LRUCache<string, true>({
  max: 10_000,
  ttl: VIEW_DEDUPE_WINDOW_MS,
})

export interface AuditPhiParams {
  /** Authenticated user from the route's auth gate. */
  user: { id: string; email?: string | null }
  /** Role the route already resolved for authorization (avoid re-querying). */
  role?: string | null
  action: AuditAction
  resourceType: ResourceType
  resourceId?: string | number | null
  /** Small, structured context — e.g. { section: 'soap' }. Never put PHI values here. */
  metadata?: Record<string, unknown>
  /** Pass the route's request to capture ip/user-agent/path. */
  request?: NextRequest | Request
}

function requestContext(request?: NextRequest | Request): {
  ip: string
  userAgent: string
  pageUrl: string | null
} {
  if (!request) return { ip: 'unknown', userAgent: 'unknown', pageUrl: null }
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  let pageUrl: string | null = (request as NextRequest).nextUrl?.pathname ?? null
  if (!pageUrl && request.url) {
    try {
      pageUrl = new URL(request.url).pathname
    } catch {
      pageUrl = null
    }
  }
  return {
    ip,
    userAgent: request.headers.get('user-agent') || 'unknown',
    pageUrl,
  }
}

/**
 * Log a PHI access/mutation event. Synchronous from the caller's perspective —
 * the database insert runs in the background. Call it and move on:
 *
 *   auditPhi({ user, role, action: 'encounter_viewed', resourceType: 'encounter',
 *              resourceId: encounterId, request })
 */
export function auditPhi(params: AuditPhiParams): void {
  try {
    const { user, role, action, resourceType, resourceId, metadata, request } = params

    if (VIEW_ACTIONS.has(action)) {
      const dedupeKey = `${user.id}:${action}:${resourceType}:${resourceId ?? ''}`
      if (recentViews.has(dedupeKey)) return
      recentViews.set(dedupeKey, true)
    }

    const { ip, userAgent, pageUrl } = requestContext(request)

    // Detached insert — deliberately not awaited anywhere.
    void (async () => {
      try {
        const admin = createAdminClient()
        const { error } = await admin.from('audit_logs').insert({
          user_id: user.id,
          user_name: null, // enriched at read time by the admin audit viewer
          user_email: user.email ?? null,
          user_role: role ?? null,
          action,
          resource_type: resourceType,
          resource_id: resourceId != null ? String(resourceId) : null,
          ip_address: ip,
          user_agent: userAgent,
          page_url: pageUrl,
          metadata: metadata ?? null,
        })
        if (error && process.env.NODE_ENV === 'development') {
          console.error('[audit-phi] insert failed:', error)
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[audit-phi] insert threw:', err)
        }
      }
    })()
  } catch (err) {
    // Absolute guarantee: auditing never breaks the request.
    if (process.env.NODE_ENV === 'development') {
      console.error('[audit-phi] failed synchronously:', err)
    }
  }
}

/** Test hook: clear the view-dedupe window. */
export function __clearAuditPhiDedupe(): void {
  recentViews.clear()
}
