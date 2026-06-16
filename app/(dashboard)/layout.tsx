'use client'

import { useAuth } from '@/lib/auth-context'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { Chat } from '@/components/Chat'
import { BrandLogo } from '@/components/BrandLogo'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useT } from '@/lib/i18n'
import { AuditTracker } from '@/components/AuditTracker'
import {
  AppSidebar,
  type SidebarNavItem,
  type SidebarNavSection,
} from '@/components/AppSidebar'
import { UserAvatar } from '@/components/UserAvatar'
import { MobileTabBar, type MobileTabItem } from '@/components/mobile/MobileTabBar'
import { InstallPromptBanner } from '@/components/pwa/InstallPromptBanner'
import { useUserProfile } from '@/lib/hooks/use-user-profile'
import { resolveDisplayName } from '@/lib/display-name'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, role, signOut } = useAuth()
  const pathname = usePathname()
  const { t } = useT()
  const { profile } = useUserProfile()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)

  const profileIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )

  const handleSignOut = async () => {
    if (isSigningOut) return
    
    try {
      setIsSigningOut(true)
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      setIsSigningOut(false)
    }
  }

  type MenuItem = {
    name: string
    href: string
    icon: React.ReactNode
    onClick?: () => void
  }

  const doctorMenuItems: MenuItem[] = [
    {
      name: t('nav.dashboard'),
      href: '/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: t('nav.flowboard'),
      href: '/dashboard/flowboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      name: t('nav.patients_history'),
      href: '/dashboard/patients-history',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      name: t('nav.i693'),
      href: '/dashboard/i-693',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      name: t('nav.chat'),
      href: '#',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      onClick: () => setIsChatOpen(true),
    },
  ]

  const nurseMenuItems: MenuItem[] = [
    {
      name: t('nav.dashboard'),
      href: '/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: t('nav.flowboard'),
      href: '/dashboard/nurse-flowboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      name: t('nav.patients_history'),
      href: '/dashboard/patients-history',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      name: t('nav.i693'),
      href: '/dashboard/i-693',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      name: t('nav.chat'),
      href: '#',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      onClick: () => setIsChatOpen(true),
    },
  ]

  const adminMenuItems: MenuItem[] = [...doctorMenuItems]

  const menuItems =
    role === 'admin'
      ? adminMenuItems
      : role === 'doctor'
      ? doctorMenuItems
      : role === 'nurse'
      ? nurseMenuItems
      : []

  const withPatientsActive = (item: MenuItem): SidebarNavItem => ({
    ...item,
    isActive: (p) =>
      item.href === '/dashboard/patients-history'
        ? p === item.href || p.startsWith('/patient-file/')
        : p === item.href,
  })

  const profileNavItem: SidebarNavItem = {
    name: t('nav.profile'),
    href: '/dashboard/profile',
    icon: profileIcon,
    isActive: (p) => p === '/dashboard/profile',
  }

  const sidebarSections: SidebarNavSection[] = [
    {
      title: t('nav.section.navigation'),
      items: [...menuItems.map(withPatientsActive), profileNavItem],
    },
  ]

  const displayName =
    profile?.display_name ??
    resolveDisplayName({
      full_name: profile?.full_name,
      email: profile?.email ?? user?.email,
      role: role ?? undefined,
      userMetadata: user?.user_metadata,
    })

  const showSidebar = role === 'doctor' || role === 'nurse' || role === 'admin'

  const chatMenuItem = menuItems.find((item) => item.href === '#')

  const mobileTabItems: MobileTabItem[] = [
    ...menuItems
      .filter((item) => item.href !== '#')
      .slice(0, 4)
      .map((item) => ({
        key: item.href,
        label: item.name,
        icon: item.icon,
        href: item.href,
        isActive: (p: string) =>
          item.href === '/dashboard/patients-history'
            ? p === item.href || p.startsWith('/patient-file/')
            : p === item.href,
      })),
    ...(chatMenuItem
      ? [
          {
            key: 'chat',
            label: chatMenuItem.name,
            icon: chatMenuItem.icon,
            onClick: () => setIsChatOpen(true),
          },
        ]
      : []),
    {
      key: '/dashboard/profile',
      label: t('nav.profile'),
      icon: profileIcon,
      href: '/dashboard/profile',
      isActive: (p: string) => p === '/dashboard/profile',
    },
  ]

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f5f7fb]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shrink-0">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-2 h-16 sm:h-20 min-h-[4rem]">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <Link href="/dashboard" className="flex min-w-0 items-center gap-2 sm:gap-3">
                <BrandLogo variant="header" className="shadow-md !py-1" />
                <div className="hidden md:flex flex-col min-w-0">
                  <span className="text-xs text-slate-500 leading-tight">{t('auth.electronic_records')}</span>
                </div>
              </Link>
            </div>
            {user && (
              <div className="flex items-center gap-3 relative">
                <LanguageToggle />
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-slate-900">{displayName}</p>
                  <p className="text-xs text-slate-500 capitalize">{role || 'User'}</p>
                </div>
                <Link href="/dashboard/profile" title={t('nav.profile')}>
                  <UserAvatar
                    key={profile?.avatar_id ?? 'avatar-none'}
                    name={displayName}
                    avatarId={profile?.avatar_id}
                    avatarUrl={profile?.avatar_url}
                    size="md"
                    ringClassName="ring-2 ring-white shadow-sm"
                  />
                </Link>
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  title={t('common.sign_out')}
                  aria-label={t('common.sign_out')}
                  className="inline-flex items-center gap-2 px-2.5 sm:px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6-9H6a2 2 0 00-2 2v14a2 2 0 002 2h7" />
                  </svg>
                  <span className="hidden sm:inline">{isSigningOut ? t('common.signing_out') : t('common.sign_out')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-2 sm:gap-3 px-2 sm:px-3 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-3">
        {showSidebar && user && (
          <AppSidebar
            sections={sidebarSections}
            pathname={pathname}
            theme="blue"
            storageKey="memr-sidebar-dashboard"
            collapseLabel={t('nav.sidebar.collapse')}
            expandLabel={t('nav.sidebar.expand')}
            closeLabel={t('nav.sidebar.close')}
            homeHref="/dashboard"
            user={{
              name: displayName,
              subtitle: role ? String(role) : undefined,
              avatarId: profile?.avatar_id,
              avatarUrl: profile?.avatar_url,
              profileHref: '/dashboard/profile',
            }}
          />
        )}

        <main className="min-w-0 flex-1 text-slate-900 [color-scheme:light] overflow-y-auto rounded-xl sm:rounded-2xl">
          {children}
        </main>
      </div>

      {showSidebar && user && <MobileTabBar items={mobileTabItems} theme="blue" />}
      <InstallPromptBanner />

      <Chat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      <AuditTracker />
    </div>
  )
}
