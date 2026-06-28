'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { mapRoleToEnum } from '@/lib/roles'

export type UserProfileSummary = {
  avatar_id: string | null
  avatar_url: string | null
  full_name: string | null
  email: string | null
  role: string | null
  display_name: string
  npi?: string | null
  compliance_access?: boolean
}

type UserProfileContextValue = {
  profile: UserProfileSummary | null
  loading: boolean
  refreshProfile: () => Promise<void>
  patchProfile: (patch: Partial<UserProfileSummary>) => void
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null)

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user, applyRoleFromProfile } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id
  const [profile, setProfile] = useState<UserProfileSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/me/profile', { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        const nextProfile: UserProfileSummary = {
          avatar_id: data.avatar_id ?? null,
          avatar_url: data.avatar_url ?? null,
          full_name: data.full_name ?? null,
          email: data.email ?? null,
          role: data.role ?? null,
          display_name: data.display_name ?? data.full_name ?? data.email ?? 'User',
          npi: data.npi ?? null,
          compliance_access: data.compliance_access === true,
        }
        setProfile(nextProfile)
        applyRoleFromProfile(mapRoleToEnum(nextProfile.role))
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [userId, applyRoleFromProfile])

  const patchProfile = useCallback((patch: Partial<UserProfileSummary>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev))
    if (patch.role !== undefined) {
      applyRoleFromProfile(mapRoleToEnum(patch.role))
    }
  }, [applyRoleFromProfile])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile, userId])

  // Re-fetch when auth user metadata changes without a new user id (USER_UPDATED).
  useEffect(() => {
    if (!userId) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED') {
        void refreshProfile()
      }
    })
    return () => subscription.unsubscribe()
  }, [userId, supabase, refreshProfile])

  const value = useMemo(
    () => ({ profile, loading, refreshProfile, patchProfile }),
    [profile, loading, refreshProfile, patchProfile]
  )

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext)
  if (!ctx) {
    throw new Error('useUserProfile must be used within UserProfileProvider')
  }
  return ctx
}
