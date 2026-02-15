'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from './supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type { UserRole } from './roles'
import { isValidRole, mapRoleToEnum } from './roles'

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
  const supabase = createClient()

  // Fetch role from Supabase profiles table (matches existing schema)
  const fetchUserRole = async (userId: string, retryCount = 0): Promise<UserRole | null> => {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000) // 5 second timeout
      })

      const queryPromise = supabase
        .from('profiles')
        .select('role')
        .eq('uid', userId)
        .single()

      const result = await Promise.race([queryPromise, timeoutPromise])

      if (result === null) {
        // Timeout occurred - retry once if we haven't already
        if (retryCount < 1) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Role fetch timed out, retrying...')
          }
          await new Promise(resolve => setTimeout(resolve, 1000))
          return fetchUserRole(userId, retryCount + 1)
        }
        if (process.env.NODE_ENV === 'development') {
          console.warn('Role fetch timed out after retry')
        }
        return null
      }

      const { data, error } = result as Awaited<typeof queryPromise>

      if (error || !data) {
        // Retry once if it's a network error
        if (retryCount < 1 && error?.code === 'PGRST116') {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Role fetch error, retrying...', error?.message)
          }
          await new Promise(resolve => setTimeout(resolve, 1000))
          return fetchUserRole(userId, retryCount + 1)
        }
        // Fallback to user metadata if profile doesn't exist
        if (process.env.NODE_ENV === 'development') {
          console.warn('Error fetching role from profiles:', error?.message || 'No data')
        }
        return null
      }

      // Map role to enum (staff maps to nurse)
      const mappedRole = mapRoleToEnum(data.role)
      if (mappedRole) {
        return mappedRole
      }
      return null
    } catch (error) {
      // Retry once on unexpected errors
      if (retryCount < 1) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Unexpected error fetching role, retrying...', error)
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
        return fetchUserRole(userId, retryCount + 1)
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
    const dbRole = await fetchUserRole(user.id)
    if (dbRole) {
      // Update user metadata with role for faster access
      return dbRole
    }

    return null
  }

  useEffect(() => {
    let isMounted = true
    let retryCount = 0
    const maxRetries = 2
    
    // Get initial session with timeout and retry logic
    const initAuth = async () => {
      try {
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise<{ data: { session: null }, error: null }>((resolve) => {
          setTimeout(() => resolve({ data: { session: null }, error: null }), 10000) // 10 second timeout
        })

        const result = await Promise.race([sessionPromise, timeoutPromise])
        
        if (!isMounted) return

        const { data: { session }, error } = result
        
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
            setRoleState(userRole)
          }
        } else {
          if (isMounted) {
            setRoleState(null)
          }
        }
        if (isMounted) {
          setLoading(false)
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error in getSession:', error)
        }
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    initAuth()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return
      
      // Handle different auth events
      if (event === 'SIGNED_OUT') {
        // Only clear state on explicit sign out, not on token refresh
        setSession(null)
        setUser(null)
        setRoleState(null)
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
            setRoleState(userRole)
          }
        }
        if (isMounted) {
          setLoading(false)
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
            setRoleState(userRole)
          }
        }
      }
      
      if (isMounted) {
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (!error && data.user) {
      // Fetch role from database
      const userRole = await extractRole(data.user)
      setRoleState(userRole)
      // Redirect based on role
      if (userRole) {
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
      setRoleState(data.user.role)
      
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
    setRoleState(newRole)
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
        setRoleState(metadata.role)
      } else {
        // Fetch role from database after signup
        const userRole = await extractRole(data.user)
        setRoleState(userRole)
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
      setRoleState(null)

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
      setRoleState(null)
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
          setRoleState(testRole)
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

