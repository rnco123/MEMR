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

export type UserProfileSummary = {
  avatar_id: string | null
  avatar_url: string | null
  full_name: string | null
  email: string | null
  role: string | null
  display_name: string
}

type UserProfileContextValue = {
  profile: UserProfileSummary | null
  loading: boolean
  refreshProfile: () => Promise<void>
  patchProfile: (patch: Partial<UserProfileSummary>) => void
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null)

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const enabled = !!user
  const [profile, setProfile] = useState<UserProfileSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshProfile = useCallback(async () => {
    if (!enabled) {
      setProfile(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/me/profile', { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setProfile({
          avatar_id: data.avatar_id ?? null,
          avatar_url: data.avatar_url ?? null,
          full_name: data.full_name ?? null,
          email: data.email ?? null,
          role: data.role ?? null,
          display_name: data.display_name ?? data.full_name ?? data.email ?? 'User',
        })
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [enabled])

  const patchProfile = useCallback((patch: Partial<UserProfileSummary>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile, user?.id])

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
