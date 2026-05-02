'use client'

import { useAuth } from '@/lib/auth-context'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { Chat } from '@/components/Chat'
import { BrandLogo } from '@/components/BrandLogo'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useT } from '@/lib/i18n'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, role, signOut } = useAuth()
  const pathname = usePathname()
  const { t } = useT()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [showPharmacyApiPanel, setShowPharmacyApiPanel] = useState(false)
  const [pharmacyApiKey, setPharmacyApiKey] = useState('')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const pharmacyApiBaseUrl = `${origin}/api/pharmacy/prescriptions`
  const pharmacyBrowserUrl = pharmacyApiKey.trim()
    ? `${pharmacyApiBaseUrl}?api_key=${encodeURIComponent(pharmacyApiKey.trim())}&limit=100`
    : `${pharmacyApiBaseUrl}?api_key=YOUR_API_KEY&limit=100`
  const pharmacyCurl = `curl -H "Authorization: Bearer ${pharmacyApiKey.trim() || 'YOUR_API_KEY'}" "${pharmacyApiBaseUrl}?limit=100"`

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
      name: t('nav.eprescribe'),
      href: '/dashboard/prescriptions',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
    {
      name: t('nav.orders'),
      href: '/dashboard/orders',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      name: t('nav.followups'),
      href: '/dashboard/follow-ups',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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
    {
      name: 'Pharmacies',
      href: '/dashboard/pharmacies',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
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
      name: t('nav.orders'),
      href: '/dashboard/orders',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      name: t('nav.followups'),
      href: '/dashboard/follow-ups',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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
    {
      name: 'Pharmacies',
      href: '/dashboard/pharmacies',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
  ]

  const menuItems = role === 'doctor' ? doctorMenuItems : role === 'nurse' || role === 'staff' ? nurseMenuItems : []

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link href="/dashboard" className="flex items-center gap-3 min-w-0 group">
              <BrandLogo variant="header" />
              <div className="hidden md:flex flex-col min-w-0">
                <span className="text-xs text-slate-500 leading-tight">{t('auth.electronic_records')}</span>
              </div>
            </Link>
            {user && (
              <div className="flex items-center gap-3 relative">
                <LanguageToggle />
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-slate-900">
                    {user.user_metadata?.full_name || user.email || 'User'}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{role || 'User'}</p>
                </div>
                <div className="w-10 h-10 bg-[#2E6EF3] rounded-full flex items-center justify-center text-white font-semibold shadow-sm">
                  {(user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPharmacyApiPanel((v) => !v)}
                  className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors text-sm font-medium"
                >
                  {t('nav.pharmacy_api')}
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSigningOut ? t('common.signing_out') : t('common.sign_out')}
                </button>
                {showPharmacyApiPanel && (
                  <div className="absolute right-0 top-16 w-[min(92vw,640px)] border border-amber-200 bg-white rounded-xl p-4 shadow-2xl z-50 space-y-3">
                    <p className="text-sm text-slate-700">
                      {t('pharmacy.give_api')}
                    </p>
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">{t('pharmacy.api_key_label')}</label>
                      <input
                        type="text"
                        value={pharmacyApiKey}
                        onChange={(e) => setPharmacyApiKey(e.target.value)}
                        placeholder={t('pharmacy.api_key_placeholder')}
                        className="w-full bg-[#f9fbff] border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">{t('pharmacy.browser_url')}</p>
                      <code className="block text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 break-all">{pharmacyBrowserUrl}</code>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">{t('pharmacy.header_request')}</p>
                      <code className="block text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 break-all">{pharmacyCurl}</code>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        {(role === 'doctor' || role === 'nurse' || role === 'staff') && (
          <aside className="w-64 bg-white border-r border-slate-200 min-h-[calc(100vh-5rem)] sticky top-20">
            <nav className="p-4 space-y-1">
              {menuItems.map((item) => {
                const isActive = pathname === item.href
                
                if (item.onClick) {
                  return (
                    <button
                      key={item.href || item.name}
                      onClick={item.onClick}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors duration-150 ${
                        isActive
                          ? 'bg-[#eef3ff] text-[#2E6EF3]'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span className={isActive ? 'text-[#2E6EF3]' : 'text-slate-400'}>
                        {item.icon}
                      </span>
                      <span className="text-sm font-medium">{item.name}</span>
                    </button>
                  )
                }
                
                return (
                  <Link
                    key={item.href || item.name}
                    href={item.href}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors duration-150 ${
                      isActive
                        ? 'bg-[#eef3ff] text-[#2E6EF3]'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className={isActive ? 'text-[#2E6EF3]' : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    <span className="text-sm font-medium">{item.name}</span>
                  </Link>
                )
              })}
            </nav>
          </aside>
        )}

        <main className="flex-1">
          {children}
        </main>
      </div>

      <Chat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  )
}
