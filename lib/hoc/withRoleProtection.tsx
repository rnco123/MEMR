'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import type { UserRole } from '@/lib/roles'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useT } from '@/lib/i18n'

interface WithRoleProtectionOptions {
  allowedRoles: UserRole[]
  redirectTo?: string
  showLoading?: boolean
}

export function withRoleProtection<P extends object>(
  Component: React.ComponentType<P>,
  options: WithRoleProtectionOptions
) {
  const { allowedRoles, redirectTo = '/', showLoading = true } = options

  return function ProtectedComponent(props: P) {
    const { user, role, loading } = useAuth()
    const router = useRouter()
    const { t } = useT()

    useEffect(() => {
      // Wait for auth to finish loading
      if (loading) return

      // If no user, redirect to home
      if (!user) {
        router.push('/')
        return
      }

      // If user has no role, redirect to home
      if (!role) {
        router.push('/')
        return
      }

      // If user's role is not in allowed roles, redirect
      if (!allowedRoles.includes(role)) {
        router.push(redirectTo)
        return
      }
    }, [user, role, loading, router, redirectTo])

    // Show loading state while checking auth (match dashboard shell — avoids blue full-screen flash)
    if (loading && showLoading) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f7fb] px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-8 shadow-lg shadow-slate-200/60">
            <LoadingSpinner
              message={t('auth.verifying_access')}
              variant="light"
              showPercentage={false}
              size="md"
            />
          </div>
        </div>
      )
    }

    // If no user or wrong role, show nothing (redirect is happening)
    if (!user || !role || !allowedRoles.includes(role)) {
      return null
    }

    // User has correct role, render the component
    return <Component {...props} />
  }
}
