'use client'

import { createContext, useContext, useEffect, useMemo, useState, useRef, type RefObject } from 'react'
import { createClient } from './supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type { UserRole } from './roles'
import { isValidRole, mapRoleToEnum } from './roles'
import { fetchProfileFields } from './fetch-user-role'
import { isAbortError } from './is-abort-error'
import { logAuditEventClient } from './audit'

interface AuthContextType {
  user: User | null
  session: Session | null
  role: UserRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  testSignIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (email: string, password: string, metadata?: { full_name?: string; role?: UserRole }) => Promise<{ error: any }>
  signOut: () => Promise<void>
  setRole: (role: UserRole) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRoleState] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
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

  // Fetch role from Supabase (uses shared helper with uid/id fallback)
  const fetchUserRoleWithRetry = async (
    userId: string,
    email: string | null | undefined,
    retryCount = 0
  ): Promise<UserRole | null> => {
    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000)
      })
      const fetchPromise = fetchProfileFields(supabase, userId, 'role', { email })
      const result = await Promise.race([fetchPromise, timeoutPromise])

      if (result === null) {
        if (retryCount < 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          return fetchUserRoleWithRetry(userId, email, retryCount + 1)
        }
        return null
      }

      const mappedRole = mapRoleToEnum(typeof result.role === 'string' ? result.role : null)
      return mappedRole || null
    } catch (error) {
      if (isAbortError(error)) return null
      if (retryCount < 1) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Unexpected error fetching role, retrying...', error)
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
        return fetchUserRoleWithRetry(userId, email, retryCount + 1)
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching user role:', error)
      }
      return null
    }
  }

  // Extract role from user metadata or fetch from database
  const extractRole = async (user: User | null): Promise<UserRole | null> => {
    if (!user) return null
    
    // First check user metadata (for test mode or legacy users)
    const metadataRole = mapRoleToEnum(user.user_metadata?.role)
    if (metadataRole) {
      return metadataRole
    }

    // If no role in metadata, fetch from database
    const dbRole = await fetchUserRoleWithRetry(user.id, user.email)
    if (dbRole) {
      // Update user metadata with role for faster access
      // Store in user metadata to avoid repeated queries
      if (user.user_metadata) {
        user.user_metadata.role = dbRole
      } else {
        user.user_metadata = { role: dbRole }
      }
      return dbRole
    }

    return null
  }

  useEffect(() => {
    let isMounted = true
    let retryCount = 0
    const maxRetries = 2
    let sessionRefreshInterval: NodeJS.Timeout | null = null

    // Safety: never leave loading true forever (e.g. if extractRole or getSession hangs)
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
        if (currentUser) {
          const userRole = await extractRole(currentUser)
          if (isMounted) {
            updateRole(userRole, true) // Preserve role on temporary failures
          }
        } else {
          if (isMounted) {
            updateRole(null, false) // No user = no role
          }
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

    // Periodic session refresh to keep session alive (refresh every 30 minutes)
    const setupPeriodicRefresh = () => {
      if (sessionRefreshInterval) {
        clearInterval(sessionRefreshInterval)
      }
      
      // Refresh more frequently to prevent expiration (every 15 minutes instead of 30)
      // This ensures we refresh before the 1-hour JWT expiration
      sessionRefreshInterval = setInterval(async () => {
        if (!isMounted) return
        
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession()
          if (currentSession) {
            // Check if session is close to expiring (within 15 minutes)
            const expiresAt = currentSession.expires_at
            if (expiresAt) {
              const now = Math.floor(Date.now() / 1000)
              const expiresIn = expiresAt - now
              // If session expires in less than 15 minutes, refresh it proactively
              if (expiresIn < 900) {
                const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
                if (!refreshError && refreshedSession && isMounted) {
                  setSession(refreshedSession)
                  const currentUser = refreshedSession.user ?? null
                  setUser(currentUser)
                  if (currentUser) {
                    const userRole = await extractRole(currentUser)
                    if (isMounted) {
                      updateRole(userRole, true)
                    }
                  }
                } else if (refreshError && isMounted) {
                  // If refresh fails, try to get session again - might be a temporary issue
                  const { data: { session: retrySession } } = await supabase.auth.getSession()
                  if (retrySession && isMounted) {
                    setSession(retrySession)
                    const retryUser = retrySession.user ?? null
                    setUser(retryUser)
                    if (retryUser) {
                      const userRole = await extractRole(retryUser)
                      if (isMounted) {
                        updateRole(userRole, true)
                      }
                    }
                  }
                }
              }
            } else {
              // If no expires_at, proactively refresh to ensure session stays alive
              const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
              if (!refreshError && refreshedSession && isMounted) {
                setSession(refreshedSession)
                const currentUser = refreshedSession.user ?? null
                setUser(currentUser)
                if (currentUser) {
                  const userRole = await extractRole(currentUser)
                  if (isMounted) {
                    updateRole(userRole, true)
                  }
                }
              }
            }
          }
        } catch (error) {
          if (isAbortError(error)) return
          if (process.env.NODE_ENV === 'development') {
            console.warn('Periodic session refresh error:', error)
          }
        }
      }, 15 * 60 * 1000) // Check every 15 minutes (more frequent to prevent expiration)
    }

    initAuth()
    setupPeriodicRefresh()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return
      
      // Handle different auth events
      if (event === 'SIGNED_OUT') {
        // Only clear state on explicit sign out, not on token refresh
        if (sessionRefreshInterval) {
          clearInterval(sessionRefreshInterval)
          sessionRefreshInterval = null
        }
        setSession(null)
        setUser(null)
        updateRole(null, false) // Explicit clear on signout
        setLoading(false)
        return
      }

      // For TOKEN_REFRESHED, SIGNED_IN, or USER_UPDATED events, update session
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setSession(session)
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          const userRole = await extractRole(currentUser)
          if (isMounted) {
            updateRole(userRole, true) // Preserve role on temporary failures
          }
        }
        if (isMounted) {
          setLoading(false)
        }
        // Restart periodic refresh when session is refreshed
        if (session) {
          setupPeriodicRefresh()
        }
        return
      }

      // For other events (like INITIAL_SESSION), update session if it exists
      if (session) {
        setSession(session)
        const currentUser = session.user ?? null
        setUser(currentUser)
        if (currentUser) {
          // Always try to fetch role to ensure it's up to date
          const userRole = await extractRole(currentUser)
          if (isMounted) {
            updateRole(userRole, true) // Preserve role on temporary failures
          }
        }
        if (isMounted) {
          setLoading(false)
        }
        // Setup periodic refresh if we have a session
        setupPeriodicRefresh()
      } else {
        // If session is null but we had a user before, try to refresh
        // This handles cases where session expired but refresh token is still valid
        // Note: At this point, event cannot be 'SIGNED_OUT' as it's already handled above
        if (user) {
          try {
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
            if (!refreshError && refreshedSession && isMounted) {
              setSession(refreshedSession)
              const refreshedUser = refreshedSession.user ?? null
              setUser(refreshedUser)
              if (refreshedUser) {
                const userRole = await extractRole(refreshedUser)
                if (isMounted) {
                  updateRole(userRole, true)
                }
              }
              setupPeriodicRefresh()
            } else if (refreshError && isMounted) {
              // Only clear state if refresh truly failed (refresh token expired)
              // Don't clear on temporary errors - try getSession as fallback
              const { data: { session: fallbackSession } } = await supabase.auth.getSession()
              if (fallbackSession && isMounted) {
                // Fallback session found, use it
                setSession(fallbackSession)
                const fallbackUser = fallbackSession.user ?? null
                setUser(fallbackUser)
                if (fallbackUser) {
                  const userRole = await extractRole(fallbackUser)
                  if (isMounted) {
                    updateRole(userRole, true)
                  }
                }
                setupPeriodicRefresh()
              } else if (refreshError.message?.includes('refresh_token_not_found') || 
                  refreshError.message?.includes('invalid_grant') ||
                  refreshError.message?.includes('expired')) {
                // Session is truly expired, clear state only as last resort
                setSession(null)
                setUser(null)
                updateRole(null, false) // Session expired = clear role
              }
            }
          } catch (err) {
            if (isAbortError(err)) return
            // Ignore refresh errors - might be temporary, try getSession as fallback
            if (process.env.NODE_ENV === 'development') {
              console.warn('Session refresh attempt failed:', err)
            }
            // Try getSession as last resort
            try {
              const { data: { session: fallbackSession } } = await supabase.auth.getSession()
              if (fallbackSession && isMounted) {
                setSession(fallbackSession)
                const fallbackUser = fallbackSession.user ?? null
                setUser(fallbackUser)
                if (fallbackUser) {
                  const userRole = await extractRole(fallbackUser)
                  if (isMounted) {
                    updateRole(userRole, true)
                  }
                }
                setupPeriodicRefresh()
              }
            } catch (fallbackErr) {
              if (isAbortError(fallbackErr)) return
              if (process.env.NODE_ENV === 'development') {
                console.warn('Fallback getSession also failed:', fallbackErr)
              }
            }
          }
        }
      }
      
      if (isMounted) {
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      clearTimeout(loadingSafetyTimeout)
      if (sessionRefreshInterval) {
        clearInterval(sessionRefreshInterval)
      }
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (!error && data.user) {
      // Immediately after sign-in, the browser auth cookies/tokens can take a moment
      // to propagate to subsequent RLS-protected reads. Retry role extraction once
      // if we didn't get a role the first time.
      let userRole = await extractRole(data.user)
      if (!userRole) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const { data: latest } = await supabase.auth.getUser()
        userRole = await extractRole(latest.user)
      }

      updateRole(userRole, true)
      logAuditEventClient('user_logged_in', 'user', data.user.id, { role: userRole }).catch(() => {})
      if (userRole === 'admin') {
        router.push('/admin')
      } else if (userRole) {
        router.push('/dashboard')
      } else {
        router.push('/')
      }
      router.refresh()
    }
    return { error }
  }

  const testSignIn = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/test-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { error: { message: data.error || 'Test login failed' } }
      }

      // Create a mock user object with role
      const mockUser = {
        id: data.user.id,
        email: data.user.email,
        user_metadata: {
          ...data.user.user_metadata,
          role: data.user.role,
        },
      } as User

      setUser(mockUser)
      updateRole(data.user.role, false)
      
      // Store in localStorage for test mode
      localStorage.setItem('test_user', JSON.stringify(mockUser))
      localStorage.setItem('test_role', data.user.role)

      // Redirect based on role
      router.push('/dashboard')
      router.refresh()

      return { error: null }
    } catch (err) {
      return { error: { message: 'Test login failed' } }
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
      // Role will be set via the trigger in user_profiles table
      // But we can set it in state for immediate use
      if (metadata?.role) {
        updateRole(metadata.role, false)
      } else {
        // Fetch role from database after signup
        const userRole = await extractRole(data.user)
        updateRole(userRole, true)
      }
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
    <AuthContext.Provider value={{ user, session, role, loading, signIn, testSignIn, signUp, signOut, setRole }}>
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

