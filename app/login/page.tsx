'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { LoginScreen } from '@/components/auth/LoginScreen'

export default function LoginPage() {
  const { user, role } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user && role) {
      router.push(role === 'admin' ? '/admin' : '/dashboard')
    }
  }, [user, role, router])

  return <LoginScreen />
}
