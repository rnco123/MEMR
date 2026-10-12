'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useAuth } from '@/lib/auth-context'
import { useT } from '@/lib/i18n'

/** Clinic manager shell: staff and locations of one tenant. No clinical pages. */
export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const { t } = useT()
  const { signOut } = useAuth()
  const pathname = usePathname()
  const [tenantName, setTenantName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/manage/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setTenantName(json?.tenant?.name ?? null))
      .catch(() => {})
  }, [])

  const nav = [
    { href: '/manage', label: t('manage.nav.staff') },
    { href: '/manage/locations', label: t('manage.nav.locations') },
    { href: '/manage/forms', label: t('manage.nav.forms') },
  ]

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/myclinic-md-logo.png" alt="MyClinic MD" width={160} height={40} className="h-9 w-auto" priority />
            {tenantName && (
              <span className="hidden truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 sm:inline">
                {tenantName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle />
            <button
              type="button"
              onClick={() => signOut()}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('common.sign_out')}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
          {nav.map((item) => {
            const active = item.href === '/manage' ? pathname === '/manage' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                  active ? 'border-[#2E6EF3] text-[#2E6EF3]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
