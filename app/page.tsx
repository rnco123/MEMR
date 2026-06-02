'use client'

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n";

export default function Home() {
  const { user, role, loading, signOut, signIn, testSignIn } = useAuth();
  const router = useRouter();
  const { t } = useT();
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email) {
      setEmailError(null)
      return true
    }
    if (!emailRegex.test(email)) {
      setEmailError(t('auth.invalid_email'))
      return false
    }
    setEmailError(null)
    return true
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setEmail(value)
    if (value) validateEmail(value)
  }

  const fillCredentials = (target: 'doctor' | 'nurse' | 'admin') => {
    setError(null)
    setEmailError(null)
    if (target === 'admin') {
      setEmail('admin@myclinicmd.com')
      setPassword('Admin@12345')
    } else if (target === 'doctor') {
      setEmail('doctor@test.com')
      setPassword('Test@12345')
    } else {
      setEmail('nancy@test.com')
      setPassword('Test@12345')
    }
  }

  useEffect(() => {
    if (!loading && user && role) {
      router.push(role === 'admin' ? '/admin' : '/dashboard')
    }
  }, [user, role, loading, router])

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSigningIn(true)

    try {
      const isTestUser = email === 'doctor@myclinicmd.com' || email === 'nurse@myclinicmd.com'

      if (isTestUser) {
        const { error } = await testSignIn(email, password)
        if (error) {
          setError(error.message)
        }
      } else {
        const { error } = await signIn(email, password)
        if (error) {
          setError(error.message)
        }
      }
    } catch (err) {
      setError(t('auth.unexpected_error'))
    } finally {
      setIsSigningIn(false)
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#eef2ff] flex items-center justify-center">
        <LoadingSpinner message={t('common.loading')} />
      </main>
    )
  }

  if (user && role) {
    return (
      <main className="min-h-screen bg-[#eef2ff] flex items-center justify-center">
        <LoadingSpinner message={t('auth.redirecting')} />
      </main>
    )
  }

  if (user && !role) {
    return (
      <main className="min-h-screen bg-[#eef2ff] flex items-center justify-center px-4 py-10 md:px-8">
        <div className="w-full max-w-2xl">
          <div className="rounded-[28px] bg-white shadow-[0_24px_80px_rgba(30,64,175,0.14)] border border-[#e6ebff] p-10 text-center">
            <div className="flex justify-center mb-6">
              <BrandLogo variant="hero" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">{t('auth.welcome')}</h2>
            <p className="text-slate-600 max-w-md mx-auto mb-8">
              {t('auth.account_setup')}
            </p>
            <button
              onClick={handleSignOut}
              className="h-11 px-6 rounded-xl bg-[#2E6EF3] text-sm font-semibold text-white transition-colors hover:bg-[#1f5ad2]"
            >
              {t('common.sign_out')}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#eef2ff] flex items-center justify-center px-4 py-10 md:px-8">
      <div className="w-full max-w-6xl">
        <div className="rounded-[28px] bg-white shadow-[0_24px_80px_rgba(30,64,175,0.14)] border border-[#e6ebff] overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="hidden md:flex relative min-h-[640px] flex-col items-center justify-center border-r border-[#e9eeff] bg-[#f9fbff] p-10">
              <div className="relative w-full max-w-[460px] aspect-square">
                <Image
                  src="/login-illustration.png"
                  alt={t('auth.brand_full')}
                  fill
                  priority
                  sizes="(min-width: 768px) 460px, 100vw"
                  className="object-contain"
                />
              </div>
              <div className="mt-6 text-center">
                <p className="text-lg font-bold text-slate-900">{t('auth.brand_full')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('auth.tagline')}</p>
              </div>
            </div>

            <div className="p-7 sm:p-10 md:p-12">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">{t('auth.welcome_back')}</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {t('auth.subtitle')}
                  </p>
                </div>
                <LanguageToggle />
              </div>

              <div className="mb-6">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">
                  {t('auth.quick_sign_in')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => fillCredentials('doctor')}
                    className="group flex items-center gap-2 rounded-xl border border-[#dbe5ff] bg-[#f9fbff] px-3 py-3 text-left transition-all hover:border-[#2E6EF3] hover:bg-[#eef3ff]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2E6EF3]/10 text-[#2E6EF3]">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{t('auth.role_doctor')}</p>
                      <p className="truncate text-[10px] text-slate-500">doctor@test.com</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillCredentials('nurse')}
                    className="group flex items-center gap-2 rounded-xl border border-[#dbe5ff] bg-[#f9fbff] px-3 py-3 text-left transition-all hover:border-[#2E6EF3] hover:bg-[#eef3ff]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2E6EF3]/10 text-[#2E6EF3]">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0v.75H4.5v-.75z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{t('auth.role_nurse')}</p>
                      <p className="truncate text-[10px] text-slate-500">nancy@test.com</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillCredentials('admin')}
                    className="group flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-3 text-left transition-all hover:border-purple-400 hover:bg-purple-100"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-purple-800">Admin</p>
                      <p className="truncate text-[10px] text-purple-500">admin@myclinicmd.com</p>
                    </div>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-semibold text-slate-600">
                    {t('auth.email')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    onBlur={() => validateEmail(email)}
                    required
                    className={`h-11 w-full rounded-xl border bg-[#f9fbff] px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] ${emailError ? 'border-red-400' : 'border-[#dbe5ff]'}`}
                    placeholder={t('auth.email_placeholder')}
                  />
                  {emailError && <p className="text-xs text-red-500">{emailError}</p>}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-semibold text-slate-600">
                    {t('auth.password')}
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 w-full rounded-xl border border-[#dbe5ff] bg-[#f9fbff] px-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
                      placeholder={t('auth.password_placeholder')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="h-11 w-full rounded-xl bg-[#2E6EF3] text-sm font-semibold text-white transition-colors hover:bg-[#1f5ad2] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSigningIn ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('auth.signing_in')}
                    </span>
                  ) : (
                    t('auth.sign_in_now')
                  )}
                </button>
              </form>

              <div className="mt-7 border-t border-slate-200 pt-5">
                <a
                  href="https://myclinicmd.com/"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#2E6EF3] transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  {t('auth.back_home')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
