'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { useT } from '@/lib/i18n'
import { LanguageToggle } from '@/components/LanguageToggle'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/auth/TurnstileWidget'
import { getTurnstileSiteKey } from '@/lib/security/turnstile'

const ADMIN_SUPPORT_EMAIL = 'admin@myclinicmd.com'

function LoginHelpNote() {
  const { t } = useT()
  return (
    <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-center text-xs leading-relaxed text-slate-500">
      {t('auth.login_help_prefix')}{' '}
      <a
        href={`mailto:${ADMIN_SUPPORT_EMAIL}?subject=${encodeURIComponent('Login support')}`}
        className="font-semibold text-[#2E6EF3] hover:underline"
      >
        {ADMIN_SUPPORT_EMAIL}
      </a>{' '}
      {t('auth.login_help_suffix')}
    </p>
  )
}

const TURNSTILE_SITE_KEY = getTurnstileSiteKey()

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileWidgetRef>(null)
  const { signIn } = useAuth()
  const { t } = useT()

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!value) {
      setEmailError(null)
      return true
    }
    if (!emailRegex.test(value)) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError(t('auth.captcha_required'))
      return
    }

    setLoading(true)
    try {
      const { error: signInError } = await signIn(email, password, captchaToken)
      if (signInError) {
        setError(signInError.message)
      }
    } catch {
      setError(t('auth.unexpected_error'))
    } finally {
      setLoading(false)
      // Turnstile tokens are single-use — reset so the widget issues a fresh one for the next attempt.
      setCaptchaToken(null)
      turnstileRef.current?.reset()
    }
  }

  const loginForm = (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="login-email" className="block text-sm font-semibold text-slate-800">
          {t('auth.email')}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400 lg:hidden">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </span>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={handleEmailChange}
            onBlur={() => validateEmail(email)}
            required
            autoComplete="email"
            className={`h-12 w-full rounded-xl border bg-white pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] lg:h-[3.25rem] lg:rounded-2xl lg:pl-4 lg:text-base ${emailError ? 'border-red-400' : 'border-slate-200'}`}
            placeholder={t('auth.email_placeholder')}
          />
        </div>
        {emailError && <p className="text-xs text-red-500">{emailError}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="login-password" className="block text-sm font-semibold text-slate-800">
          {t('auth.password')}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400 lg:hidden">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </span>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] lg:h-[3.25rem] lg:rounded-2xl lg:pl-4 lg:pr-12 lg:text-base"
            placeholder={t('auth.password_placeholder')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 px-4 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
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

      {TURNSTILE_SITE_KEY && (
        <div className="flex justify-center">
          <TurnstileWidget
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
          />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || (!!TURNSTILE_SITE_KEY && !captchaToken)}
        className="h-12 w-full rounded-full bg-[#2E6EF3] text-sm font-semibold text-white shadow-[0_8px_24px_rgba(46,110,243,0.35)] transition-colors hover:bg-[#1f5ad2] active:bg-[#1a4db8] disabled:cursor-not-allowed disabled:opacity-60 lg:h-[3.25rem] lg:rounded-2xl lg:shadow-none lg:text-base"
      >
        {loading ? t('auth.signing_in') : t('auth.sign_in_now')}
      </button>

      <LoginHelpNote />
    </form>
  )

  return (
    <>
      {/* Phone / tablet: hero top + bottom sheet form */}
      <div className="lg:hidden fixed inset-0 top-[var(--mtk-h)] z-10 flex flex-col bg-[#dbeafe]">
        {/* Top hero image */}
        <div className="relative h-[36vh] min-h-[200px] max-h-[320px] shrink-0 overflow-hidden">
          <Image
            src="/login-illustration.png"
            alt={t('auth.brand_full')}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#2E6EF3]/30 via-[#2E6EF3]/10 to-[#2E6EF3]/50" />

          <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <a
              href="https://myclinicmd.com/"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
              aria-label={t('auth.back_home')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <LanguageToggle />
          </header>
        </div>

        {/* Bottom sheet — overlaps hero */}
        <div className="relative z-20 -mt-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.12)]">
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-200" aria-hidden />

          <div className="flex-1 overflow-y-auto scroll-touch px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-slate-900">{t('auth.welcome_back')}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{t('auth.subtitle')}</p>
            </div>

            {loginForm}

            <p className="mt-8 text-center text-sm text-slate-500">
              <a href="https://myclinicmd.com/" className="font-medium text-[#2E6EF3] hover:underline">
                {t('auth.back_home')}
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Desktop: two-column card */}
      <div className="hidden lg:flex min-h-screen bg-[#eef2ff] items-center justify-center px-8 py-10">
        <div className="w-full max-w-6xl">
          <div className="rounded-[28px] bg-white shadow-[0_24px_80px_rgba(30,64,175,0.14)] border border-[#e6ebff] overflow-hidden">
            <div className="grid lg:grid-cols-2">
              <div className="relative flex min-h-[640px] flex-col items-center justify-center border-r border-[#e9eeff] bg-[#f9fbff] p-10">
                <div className="relative w-full max-w-[460px] aspect-square">
                  <Image
                    src="/login-illustration.png"
                    alt={t('auth.brand_full')}
                    fill
                    priority
                    sizes="460px"
                    className="object-contain"
                  />
                </div>
                <div className="mt-6 text-center">
                  <p className="text-lg font-bold text-slate-900">{t('auth.brand_full')}</p>
                  <p className="mt-1 text-sm text-slate-500">{t('auth.tagline')}</p>
                </div>
              </div>

              <div className="p-12">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t('auth.welcome_back')}</h1>
                    <p className="mt-2 text-sm text-slate-500">{t('auth.subtitle')}</p>
                  </div>
                  <LanguageToggle />
                </div>
                {loginForm}
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
      </div>
    </>
  )
}
