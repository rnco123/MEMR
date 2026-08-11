'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/BrandLogo'
import { Chat } from '@/components/Chat'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useT } from '@/lib/i18n'
import {
  AppSidebar,
  SidebarMenuButton,
  type SidebarNavItem,
  type SidebarNavSection,
} from '@/components/AppSidebar'
import { UserAvatar } from '@/components/UserAvatar'
import { MobileTabBar, type MobileTabItem } from '@/components/mobile/MobileTabBar'
import { useUserProfile } from '@/lib/hooks/use-user-profile'
import { resolveDisplayName } from '@/lib/display-name'
import { AuditTracker } from '@/components/AuditTracker'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { maintenanceTickerShellClassName } from '@/lib/maintenance-ticker'

const adminNavItems = [
  {
    nameKey: 'admin.nav.overview',
    href: '/admin',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.users',
    href: '/admin/users',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.audit',
    href: '/admin/audit',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.locations',
    href: '/admin/locations',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.pharmacies',
    href: '/admin/pharmacies',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.forms',
    href: '/admin/forms',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.flowboard',
    href: '/admin/flowboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6M4 4h16v16H4V4z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.appointments',
    href: '/admin/appointments',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.prescriptions',
    href: '/admin/prescriptions',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.patients_history',
    href: '/admin/patients-history',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 11h8M8 15h5M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.i693',
    href: '/admin/i-693',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.compliance',
    href: '/admin/compliance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.support',
    href: '/admin/support',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    nameKey: 'admin.nav.release_logs',
    href: '/admin/release-logs',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3a1 1 0 112 0v1.06a8.007 8.007 0 016.94 6.94H21a1 1 0 110 2h-1.06a8.007 8.007 0 01-6.94 6.94V21a1 1 0 11-2 0v-1.06a8.007 8.007 0 01-6.94-6.94H3a1 1 0 110-2h1.06A8.007 8.007 0 0111 4.06V3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2" />
      </svg>
    ),
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { t, language } = useT()
  const { profile } = useUserProfile()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [hasPendingPrescriptions, setHasPendingPrescriptions] = useState(false)
  const [hasNewReleaseLogs, setHasNewReleaseLogs] = useState(false)

  const displayName =
    profile?.display_name ??
    resolveDisplayName({
      full_name: profile?.full_name,
      email: profile?.email ?? user?.email,
      role: role ?? 'admin',
      userMetadata: user?.user_metadata,
      fallback: 'Administrator',
    })

  const adminNav = useMemo(
    () =>
      adminNavItems.map((item) => ({
        ...item,
        name: t(item.nameKey),
        badgeDot:
          (item.href === '/admin/prescriptions' && hasPendingPrescriptions) ||
          (item.href === '/admin/release-logs' && hasNewReleaseLogs),
        isActive: (pathname: string) =>
          pathname === item.href ||
          (item.href === '/admin/patients-history' && pathname.startsWith('/admin/patient-file/')),
      })),
    [t, hasPendingPrescriptions, hasNewReleaseLogs]
  )

  const adminSidebarSections: SidebarNavSection[] = useMemo(() => {
    return [
      {
        title: t('admin.nav.section.clinical'),
        items: adminNav.filter((item) =>
          ['/admin', '/admin/flowboard', '/admin/appointments', '/admin/patients-history', '/admin/i-693', '/admin/compliance'].includes(item.href)
        ),
      },
      {
        title: t('admin.nav.section.administration'),
        items: adminNav.filter((item) =>
          ['/admin/users', '/admin/audit', '/admin/locations', '/admin/pharmacies', '/admin/forms', '/admin/prescriptions', '/admin/support'].includes(item.href)
        ),
      },
    ]
  }, [adminNav, t])

  const sidebarBottomItems: SidebarNavItem[] = useMemo(() => {
    const releaseLogs = adminNav.find((item) => item.href === '/admin/release-logs')
    return releaseLogs ? [releaseLogs] : []
  }, [adminNav])

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
      return
    }
    if (role && role !== 'admin') {
      router.replace('/dashboard')
    }
  }, [user, role, loading, router])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    if (loading || !user || role !== 'admin') return
    let cancelled = false
    const checkPending = async () => {
      try {
        const res = await fetch('/api/admin/prescription-ready?status=pending', {
          credentials: 'include',
        })
        if (!res.ok) return
        const json = await res.json()
        const count =
          typeof json.totalCount === 'number' ? json.totalCount : (json.rows ?? []).length
        if (!cancelled) setHasPendingPrescriptions(count > 0)
      } catch {
        /* ignore */
      }
    }
    void checkPending()
    const interval = setInterval(() => void checkPending(), 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [loading, user, role, pathname])

  useEffect(() => {
    if (loading || !user || role !== 'admin') return
    // The release-logs page itself marks activity as seen on mount; clear the dot
    // immediately here too so it doesn't flash on the next poll tick.
    if (pathname === '/admin/release-logs') {
      setHasNewReleaseLogs(false)
      return
    }
    let cancelled = false
    const checkNewReleaseLogs = async () => {
      try {
        const res = await fetch('/api/admin/release-logs/seen', { credentials: 'include' })
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setHasNewReleaseLogs(json.hasUnseen === true)
      } catch {
        /* ignore */
      }
    }
    void checkNewReleaseLogs()
    const interval = setInterval(() => void checkNewReleaseLogs(), 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [loading, user, role, pathname])

  if (loading || !user || role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#f6f2ff] flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-8 shadow-lg shadow-slate-200/60">
          <LoadingSpinner message={t('auth.verifying_access')} />
        </div>
      </div>
    )
  }

  const handleSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try { await signOut() } finally { setIsSigningOut(false) }
  }

  const mobileTabHrefs = ['/admin', '/admin/flowboard', '/admin/patients-history', '/admin/i-693']
  const mobileTabItems: MobileTabItem[] = [
    ...adminNav
      .filter((item) => mobileTabHrefs.includes(item.href))
      .map((item) => ({
        key: item.href,
        label: item.name,
        icon: item.icon,
        href: item.href,
        isActive: item.isActive,
      })),
    {
      key: '/admin/profile',
      label: t('nav.profile'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      href: '/admin/profile',
      isActive: (p: string) => p === '/admin/profile',
    },
  ]

  return (
    <div className={`flex flex-col overflow-hidden bg-[#f6f2ff] ${maintenanceTickerShellClassName()}`}>
      <header className="bg-[#fdfbff] border-b border-purple-100 sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-2 h-16 min-h-[4rem]">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <SidebarMenuButton
                onClick={() => setMobileNavOpen(true)}
                className="border-purple-200 lg:hidden"
                label={t('nav.sidebar.open')}
              />
              <Link href="/admin" className="flex min-w-0 items-center gap-2 sm:gap-3 shrink-0">
                <BrandLogo variant="header" className="shadow-md !py-1" />
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                  {t('admin.badge')}
                </span>
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <LanguageToggle />
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="inline-flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-purple-700 text-sm font-medium hover:bg-purple-50 transition-colors"
                title={t('admin.staff_chat')}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="hidden sm:inline">{t('chat.title')}</span>
              </button>
              <Link href="/admin/profile" title={t('nav.profile')}>
                <UserAvatar
                  key={profile?.avatar_id ?? 'avatar-none'}
                  name={displayName}
                  avatarId={profile?.avatar_id}
                  avatarUrl={profile?.avatar_url}
                  size="sm"
                  ringClassName="ring-2 ring-white"
                  className={!profile?.avatar_url && !profile?.avatar_id ? 'bg-purple-600' : ''}
                />
              </Link>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                title={t('common.sign_out')}
                aria-label={t('common.sign_out')}
                className="inline-flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-xs sm:text-sm font-medium disabled:opacity-50"
              >
                <svg className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6-9H6a2 2 0 00-2 2v14a2 2 0 002 2h7" />
                </svg>
                <span className="hidden sm:inline">{isSigningOut ? t('common.signing_out') : t('common.sign_out')}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MobileTabBar is a sticky flow sibling below, so it already reserves its own
          height (and safe-area inset). Padding here only adds the page gutter. */}
      <div className="flex min-h-0 flex-1 gap-2 sm:gap-3 px-2 sm:px-3 pb-2 sm:pb-3">
        <AppSidebar
          sections={adminSidebarSections}
          bottomItems={sidebarBottomItems}
          pathname={pathname}
          theme="purple"
          storageKey="memr-sidebar-admin"
          collapseLabel={t('nav.sidebar.collapse')}
          expandLabel={t('nav.sidebar.expand')}
          closeLabel={t('nav.sidebar.close')}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
          homeHref="/admin"
          user={{
            name: displayName,
            subtitle: t('admin.administrator'),
            avatarId: profile?.avatar_id,
            avatarUrl: profile?.avatar_url,
            profileHref: '/admin/profile',
          }}
        />

        <main className="min-w-0 flex-1 text-slate-900 [color-scheme:light] bg-[#f8f4ff] overflow-hidden flex flex-col rounded-xl sm:rounded-2xl">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>

      <MobileTabBar items={mobileTabItems} theme="purple" />

      <Chat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      <AuditTracker />
    </div>
  )
}
