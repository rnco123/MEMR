'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useUserProfile } from '@/lib/hooks/use-user-profile'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useT } from '@/lib/i18n'
import { UserRole } from '@/lib/roles'

export function withComplianceAccess<P extends object>(Component: React.ComponentType<P>) {
  return function ComplianceProtectedComponent(props: P) {
    const { user, role, loading } = useAuth()
    const { profile, loading: profileLoading } = useUserProfile()
    const router = useRouter()
    const { t } = useT()

    // Only doctors (with compliance_access flag) and admins may access compliance.
    const hasAccess =
      role === UserRole.ADMIN ||
      (role === UserRole.DOCTOR && profile?.compliance_access === true)

    useEffect(() => {
      if (loading || profileLoading) return
      if (!user || !role) {
        router.push('/')
        return
      }
      if (!hasAccess) {
        router.push('/dashboard')
      }
    }, [user, role, loading, profileLoading, hasAccess, router])

    if ((loading || profileLoading) && !profile) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f7fb] px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-8 shadow-lg shadow-slate-200/60">
            <LoadingSpinner message={t('auth.verifying_access')} />
          </div>
        </div>
      )
    }

    if (!user || !role || !hasAccess) {
      return null
    }

    return <Component {...props} />
  }
}
