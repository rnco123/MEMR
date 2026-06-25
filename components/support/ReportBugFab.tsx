'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { UserRole } from '@/lib/roles'
import { BugReportModal } from './BugReportModal'
import { usePathname } from 'next/navigation'

export function ReportBugFab() {
  const { user, role, loading } = useAuth()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  // Hide for admins, unauthenticated users, loading state, and auth pages
  if (loading || !user || role === UserRole.ADMIN) return null
  if (pathname === '/login' || pathname === '/signup' || pathname === '/') return null
  if (pathname === '/dashboard/support' || pathname.startsWith('/dashboard/support')) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Report a bug"
        className="fixed bottom-[5.5rem] right-4 z-40 sm:bottom-6 sm:right-6 flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600 hover:shadow-red-500/50 hover:scale-110 active:scale-95 transition-all duration-200"
        aria-label="Report a bug"
      >
        {/* Bug icon */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M9.75 3.75L7.5 6M14.25 3.75L16.5 6M4.5 9h15M4.5 15h15M7.5 9a4.5 4.5 0 014.5-4.5 4.5 4.5 0 014.5 4.5v6a4.5 4.5 0 01-4.5 4.5 4.5 4.5 0 01-4.5-4.5V9z" />
        </svg>
        {/* Pulse ring */}
        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
      </button>

      <BugReportModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
