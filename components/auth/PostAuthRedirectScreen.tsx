'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useT } from '@/lib/i18n'

export function PostAuthRedirectScreen() {
  const { t } = useT()

  return (
    <main className="min-h-[100dvh] bg-[#f5f7fb] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-8 shadow-lg shadow-slate-200/60">
        <LoadingSpinner message={t('auth.redirecting')} />
      </div>
    </main>
  )
}
