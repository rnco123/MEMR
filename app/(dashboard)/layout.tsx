'use client'

import { useAuth } from '@/lib/auth-context'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Chat } from '@/components/Chat'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, role, signOut } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)

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
      name: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Flowboard',
      href: '/dashboard/flowboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      name: 'Patients History',
      href: '/dashboard/patients-history',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      name: 'Chat',
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
      name: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Flowboard',
      href: '/dashboard/nurse-flowboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      name: 'Patients History',
      href: '/dashboard/patients-history',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      name: 'Chat',
      href: '#',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      onClick: () => setIsChatOpen(true),
    },
  ]

  const menuItems = role === 'doctor' ? doctorMenuItems : role === 'nurse' || role === 'staff' ? nurseMenuItems : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <header className="bg-white/10 backdrop-blur-xl border-b border-white/20 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" viewBox="0 0 100 100" fill="currentColor">
                  <circle cx="58" cy="22" r="10" fill="none" stroke="currentColor" strokeWidth="4"/>
                  <path d="M25 50h20v30h10V50h20v-10h-20V20h-10v20h-20z" fill="currentColor"/>
                  <path d="M20 75 Q50 45 80 25" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">MyclinicMD</h1>
                <p className="text-xs text-blue-200">Electronic Medical Records</p>
              </div>
            </div>
            {user && (
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-white">
                    {user.user_metadata?.full_name || user.email || 'User'}
                  </p>
                  <p className="text-xs text-blue-200 capitalize">{role || 'User'}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-semibold shadow-lg">
                  {(user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl hover:bg-red-500/30 transition-all text-sm font-medium backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSigningOut ? 'Signing out...' : 'Sign Out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        {(role === 'doctor' || role === 'nurse' || role === 'staff') && (
          <aside className="w-64 bg-white/5 backdrop-blur-xl border-r border-white/10 min-h-[calc(100vh-5rem)] sticky top-20">
            <nav className="p-4 space-y-2">
              {menuItems.map((item) => {
                const isActive = pathname === item.href
                
                if (item.onClick) {
                  return (
                    <button
                      key={item.href || item.name}
                      onClick={item.onClick}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/50 text-white shadow-lg'
                          : 'text-blue-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className={isActive ? 'text-blue-400' : 'text-blue-300'}>
                        {item.icon}
                      </span>
                      <span className="font-medium">{item.name}</span>
                    </button>
                  )
                }
                
                return (
                  <Link
                    key={item.href || item.name}
                    href={item.href}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/50 text-white shadow-lg'
                        : 'text-blue-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className={isActive ? 'text-blue-400' : 'text-blue-300'}>
                      {item.icon}
                    </span>
                    <span className="font-medium">{item.name}</span>
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

      {/* Chat Modal */}
      <Chat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  )
}
