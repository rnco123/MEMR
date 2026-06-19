'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/lib/roles'
import { POST_LOGIN_REDIRECT_MIN_MS, postLoginDestination } from '@/lib/auth/post-login-redirect'

export function useDelayedRoleRedirect(role: UserRole | null, enabled: boolean) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled || !role) return

    const destination = postLoginDestination(role)
    const timer = window.setTimeout(() => {
      router.push(destination)
      router.refresh()
    }, POST_LOGIN_REDIRECT_MIN_MS)

    return () => window.clearTimeout(timer)
  }, [enabled, role, router])
}
