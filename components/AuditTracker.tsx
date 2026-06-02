'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { logAuditEventClient } from '@/lib/audit'

/**
 * Silently tracks page navigation and logs to audit_logs.
 * Mount once at the top level for authenticated users.
 */
export function AuditTracker() {
  const pathname = usePathname()
  const { user, role } = useAuth()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (!user) return
    // Skip routine admin pages; still audit clinical work done from admin (e.g. I-693)
    if (
      pathname.startsWith('/admin') &&
      !pathname.includes('i-693') &&
      !pathname.includes('flowboard') &&
      !pathname.includes('patients-history') &&
      !pathname.includes('patient-file')
    ) {
      return
    }
    // Skip same path
    if (lastPath.current === pathname) return
    lastPath.current = pathname

    logAuditEventClient('page_view', 'system', undefined, {
      path: pathname,
      role,
    })
  }, [pathname, user, role])

  return null
}
