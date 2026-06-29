'use client'

import { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { createClient } from './supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import type { UserRole } from './roles'
import { isValidRole, mapRoleToEnum } from './roles'
import { isAbortError } from './is-abort-error'
import { logAuditEventClient } from './audit'
import { preloadVerifyingAccessAnimation } from './lottie/verifying-access'

interface AuthContextType {
  user: User | null
  session: Session | null
  role: UserRole | null
  loading: boolean
  signIn: (email: string, password: string, turnstileToken?: string | null) => Promise<{ error: any }>
  signUp: (email: string, password: string, metadata?: { full_name?: string; role?: UserRole }) => Promise<{ error: any }>
  signOut: () => Promise<void>
  setRole: (role: UserRole) => void
  /** Called by UserProfileProvider when /api/me/profile returns — sole source for API-backed role. */
  applyRoleFromProfile: (role: UserRole | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRoleState] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])
  // Use ref to preserve role during refreshes to prevent welcome screen on temporary failures
  const roleRef = useRef<UserRole | null>(null)
  
  // Helper to update role state and ref together
  const updateRole = (newRole: UserRole | null, preserveOnNull = false) => {
    if (newRole) {
      setRoleState(newRole)
      roleRef.current = newRole
    } else if (preserveOnNull && roleRef.current) {
      // Preserve previous role on temporary failures
      setRoleState(roleRef.current)
    } else {
      // Clear role (user truly has no role or explicit clear)
      setRoleState(null)
      roleRef.current = null
    }
  }

  const applyRoleFromProfile = useCallback((newRole: UserRole | null) => {
    updateRole(newRole, true)
  }, [])

  useEffect(() => {
    let isMounted = true
    let retryCount = 0
    const maxRetries = 2

    // Safety: never leave loading true forever (e.g. if getSession hangs)
    const loadingSafetyTimeout = setTimeout(() => {
      if (isMounted) {
        setLoading(false)
      }
    }, 12000)
    
    // Get initial session with timeout and retry logic
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (!isMounted) return
        
        // If there's an error and we haven't retried too many times, retry
        if (error && retryCount < maxRetries && isMounted) {
          retryCount++
          if (process.env.NODE_ENV === 'development') {
            console.warn(`Session fetch error, retrying (${retryCount}/${maxRetries}):`, error)
          }
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000))
          return initAuth()
        }
        
        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error getting session:', error)
        }
        
        setSession(session)
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (!currentUser) {
          updateRole(null, false)
        }
        if (isMounted) {
          setLoading(false)
        }
      } catch (error) {
        if (isAbortError(error)) {
          if (isMounted) setLoading(false)
          return
        }
        if (process.env.NODE_ENV === 'development') {
          console.error('Error in getSession:', error)
        }
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    initAuth()

    // Listen for auth changes — autoRefreshToken on the browser client handles token renewal.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return

      if (event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
        updateRole(null, false)
        setLoading(false)
        return
      }

      if (event === 'TOKEN_REFRESHED') {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        return
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        return
      }

      if (event === 'INITIAL_SESSION') {
        if (session) {
          setSession(session)
          setUser(session.user ?? null)
        }
        setLoading(false)
        return
      }

      if (session) {
        setSession(session)
        setUser(session.user ?? null)
      }
      setLoading(false)
    })

    return () => {
      isMounted = false
      clearTimeout(loadingSafetyTimeout)
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once subscription by design; resubscribing on every supabase.auth reference change would create duplicate auth listeners.
  }, [])

  useEffect(() => {
    preloadVerifyingAccessAnimation()
  }, [])

  const signIn = async (email: string, password: string, turnstileToken?: string | null) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, turnstileToken }),
      })
      const data = (await res.json()) as {
        error?: string
        user?: User
        role?: string | null
      }

      if (!res.ok) {
        return { error: { message: data.error || 'Sign in failed' } }
      }

      const signedInUser = data.user ?? null
      const userRole = mapRoleToEnum(data.role) || mapRoleToEnum(signedInUser?.user_metadata?.role) || null

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSession(session)
        setUser(session.user)
      } else if (signedInUser) {
        setUser(signedInUser)
      }

      updateRole(userRole, true)
      if (signedInUser?.id) {
        logAuditEventClient('user_logged_in', 'user', signedInUser.id, { role: userRole }).catch(() => {})
      }
      return { error: null }
    } catch (err) {
      const message =
        err instanceof TypeError
          ? 'Cannot reach the login server. Check your internet connection or try a different network.'
          : 'Sign in failed'
      return { error: { message } }
    }
  }

  const setRole = (newRole: UserRole) => {
    updateRole(newRole, false)
    if (user) {
      // Update user metadata (will be persisted to Supabase in Phase 2)
      const updatedUser = {
        ...user,
        user_metadata: {
          ...user.user_metadata,
          role: newRole,
        },
      }
      setUser(updatedUser)
      // Store in localStorage for test mode
      localStorage.setItem('test_user', JSON.stringify(updatedUser))
      localStorage.setItem('test_role', newRole)
    }
  }

  const signUp = async (email: string, password: string, metadata?: { full_name?: string; role?: UserRole }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...metadata,
          role: metadata?.role,
        },
      },
    })
    if (!error && data.user) {
      if (metadata?.role) {
        updateRole(metadata.role, false)
      }
      // Role from profiles is applied when UserProfileProvider loads /api/me/profile
    }
    return { error }
  }

  const signOut = async () => {
    try {
      // Clear test mode data first
      localStorage.removeItem('test_user')
      localStorage.removeItem('test_role')
      
      // Clear state immediately
      setUser(null)
      setSession(null)
      updateRole(null, false) // Explicit signout = clear role

      // Call server-side sign out first to clear cookies
      try {
        await fetch('/api/auth/signout', {
          method: 'POST',
          credentials: 'include',
        })
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error calling signout API:', err)
        }
      }

      // Sign out from Supabase (client-side) - this should clear client-side session
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error signing out:', error)
        }
      }

      // Force redirect to home page
      window.location.href = '/'
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error in signOut:', error)
      }
      // Still clear local state and redirect even if there's an error
      localStorage.removeItem('test_user')
      localStorage.removeItem('test_role')
      setUser(null)
      setSession(null)
      updateRole(null, false) // Explicit signout = clear role
      // Force redirect
      window.location.href = '/'
    }
  }

  // Check for test mode user on mount
  useEffect(() => {
    if (!user && !loading) {
      const testUser = localStorage.getItem('test_user')
      const testRole = localStorage.getItem('test_role')
      if (testUser && testRole && isValidRole(testRole)) {
        try {
          const parsedUser = JSON.parse(testUser) as User
          setUser(parsedUser)
          updateRole(testRole, false)
        } catch (e) {
          // Invalid test user data, clear it
          localStorage.removeItem('test_user')
          localStorage.removeItem('test_role')
        }
      }
    }
  }, [user, loading])

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signUp, signOut, setRole, applyRoleFromProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

