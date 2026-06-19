'use client'

import { useAuth } from '@/lib/auth-context'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { PostAuthRedirectScreen } from '@/components/auth/PostAuthRedirectScreen'
import { useDelayedRoleRedirect } from '@/lib/hooks/use-delayed-role-redirect'

export default function LoginPage() {
  const { user, role, loading } = useAuth()

  useDelayedRoleRedirect(role, !loading && !!user && !!role)

  if (user && role) {
    return <PostAuthRedirectScreen />
  }

  return <LoginScreen />
}
