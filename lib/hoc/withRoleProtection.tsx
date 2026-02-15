'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import type { UserRole } from '@/lib/roles'
import { LoadingSpinner } from '@/components/LoadingSpinner'

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

    // Show loading state while checking auth
    if (loading && showLoading) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
          </div>
          
          <div className="relative z-10 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 animate-spin" />
              </div>
              
              <p className="text-white/70 text-sm font-medium tracking-wide">
                Verifying access...
              </p>
            </div>
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
