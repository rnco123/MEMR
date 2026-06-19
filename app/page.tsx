'use client'

import { useAuth } from '@/lib/auth-context'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { PostAuthRedirectScreen } from '@/components/auth/PostAuthRedirectScreen'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { BrandLogo } from '@/components/BrandLogo'
import { useDelayedRoleRedirect } from '@/lib/hooks/use-delayed-role-redirect'
import { useT } from '@/lib/i18n'

export default function Home() {
  const { user, role, loading, signOut } = useAuth()
  const { t } = useT()

  useDelayedRoleRedirect(role, !loading && !!user && !!role)

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[#f5f7fb] flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-8 shadow-lg shadow-slate-200/60">
          <LoadingSpinner message={t('common.loading')} />
        </div>
      </main>
    )
  }

  if (user && role) {
    return <PostAuthRedirectScreen />
  }

  if (user && !role) {
    return (
      <main className="min-h-[100dvh] bg-white lg:bg-[#eef2ff] flex items-center justify-center px-6 py-10 lg:px-8">
        <div className="w-full max-w-2xl">
          <div className="rounded-[28px] bg-white shadow-[0_24px_80px_rgba(30,64,175,0.14)] border border-[#e6ebff] p-10 text-center">
            <div className="flex justify-center mb-6">
              <BrandLogo variant="hero" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">{t('auth.welcome')}</h2>
            <p className="text-slate-600 max-w-md mx-auto mb-8">{t('auth.account_setup')}</p>
            <button
              onClick={() => signOut()}
              className="h-11 px-6 rounded-xl bg-[#2E6EF3] text-sm font-semibold text-white transition-colors hover:bg-[#1f5ad2]"
            >
              {t('common.sign_out')}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return <LoginScreen />
}
