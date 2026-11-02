'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AddressLookupInput } from '@/components/AddressLookupInput'
import { LanguageToggle } from '@/components/LanguageToggle'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/auth/TurnstileWidget'
import { useT } from '@/lib/i18n'
import { getTurnstileSiteKey } from '@/lib/security/turnstile'

const TURNSTILE_SITE_KEY = getTurnstileSiteKey()

type Form = {
  contact_name: string
  email: string
  password: string
  tenant_name: string
  location_name: string
  location_address: string
  location_phone: string
  location_email: string
}

const EMPTY: Form = {
  contact_name: '',
  email: '',
  password: '',
  tenant_name: '',
  location_name: '',
  location_address: '',
  location_phone: '',
  location_email: '',
}

/** Mirrors signupPasswordSchema in lib/signup-requests/types.ts. */
const PASSWORD_RULES: { key: string; test: (pw: string) => boolean }[] = [
  { key: 'signup.pw.length', test: (pw) => pw.length >= 8 },
  { key: 'signup.pw.upper', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'signup.pw.lower', test: (pw) => /[a-z]/.test(pw) },
  { key: 'signup.pw.number', test: (pw) => /[0-9]/.test(pw) },
  { key: 'signup.pw.special', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-[#2E6EF3] focus:outline-none focus:ring-4 focus:ring-[#2E6EF3]/15'

function Field({
  id,
  label,
  className = '',
  children,
}: {
  id: string
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  )
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2E6EF3]/10 text-xs font-bold text-[#2E6EF3]">
          {step}
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

export default function SignupPage() {
  const { t } = useT()
  const [form, setForm] = useState<Form>(EMPTY)
  const [showPassword, setShowPassword] = useState(false)
  // Kept out of `form` so it is never sent to the server.
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileWidgetRef>(null)

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const passwordOk = PASSWORD_RULES.every((r) => r.test(form.password))
  const passwordsMatch = confirmPassword === form.password

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!passwordOk) {
      setError(t('signup.error_fields'))
      return
    }
    if (!passwordsMatch) {
      setError(t('signup.pw.mismatch'))
      return
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError(t('auth.captcha_required'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/clinic-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, turnstileToken: captchaToken }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(json.error || t('signup.error_generic'))
        return
      }
      setDone(true)
    } catch {
      setError(t('signup.error_generic'))
    } finally {
      setSubmitting(false)
      setCaptchaToken(null)
      turnstileRef.current?.reset()
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-80 bg-gradient-to-b from-[#2E6EF3]/10 to-transparent" aria-hidden />

      <header className="relative z-10 mx-auto flex h-20 max-w-5xl sm:h-24 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <Image src="/myclinic-md-logo.png" alt="MyClinic MD" width={320} height={80} className="h-16 w-auto sm:h-20" priority />
        </Link>
        <LanguageToggle />
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        {done ? (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-[0_24px_60px_-20px_rgba(30,64,175,0.2)] sm:p-12">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <h1 className="mt-6 text-2xl font-bold text-slate-900">{t('signup.success.title')}</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">{t('signup.success.body')}</p>
            <Link
              href="/login"
              className="mt-8 inline-flex h-11 items-center rounded-full bg-[#2E6EF3] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#1f5ad2]"
            >
              {t('signup.success.cta')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t('signup.title')}</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 sm:text-base">{t('signup.subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" data-testid="clinic-signup-form">
              <Section step={1} title={t('signup.section.contact')} hint={t('signup.section.contact_hint')}>
                <Field id="su-contact-name" label={t('signup.field.contact_name')}>
                  <input id="su-contact-name" className={INPUT_CLASS} value={form.contact_name} onChange={set('contact_name')}
                    required minLength={2} maxLength={100} autoComplete="name" placeholder={t('signup.field.contact_name_ph')} />
                </Field>
                <Field id="su-email" label={t('signup.field.email')}>
                  <input id="su-email" type="email" className={INPUT_CLASS} value={form.email} onChange={set('email')}
                    required autoComplete="email" placeholder={t('signup.field.email_ph')} />
                </Field>
                <Field id="su-password" label={t('signup.field.password')}>
                  <div className="relative">
                    <input id="su-password" type={showPassword ? 'text' : 'password'} className={`${INPUT_CLASS} pr-16`}
                      value={form.password} onChange={set('password')} required autoComplete="new-password"
                      placeholder={t('signup.field.password_ph')} />
                    <button type="button" onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 px-3.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
                      {showPassword ? t('signup.pw.hide') : t('signup.pw.show')}
                    </button>
                  </div>
                  <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                    {PASSWORD_RULES.map((r) => {
                      const ok = r.test(form.password)
                      return (
                        <li key={r.key} className={`flex items-center gap-1.5 ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          {t(r.key)}
                        </li>
                      )
                    })}
                  </ul>
                </Field>
                <Field id="su-password-confirm" label={t('signup.field.password_confirm')}>
                  <div className="relative">
                    <input id="su-password-confirm" type={showConfirmPassword ? 'text' : 'password'}
                      className={`${INPUT_CLASS} pr-16 ${confirmPassword && !passwordsMatch ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
                      value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password"
                      placeholder={t('signup.field.password_confirm_ph')} aria-invalid={!!confirmPassword && !passwordsMatch} />
                    <button type="button" onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 px-3.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
                      {showConfirmPassword ? t('signup.pw.hide') : t('signup.pw.show')}
                    </button>
                  </div>
                  {confirmPassword && (
                    <p className={`mt-2 text-xs ${passwordsMatch ? 'text-emerald-600' : 'text-red-600'}`}>
                      {passwordsMatch ? t('signup.pw.match') : t('signup.pw.mismatch')}
                    </p>
                  )}
                </Field>
              </Section>

              <Section step={2} title={t('signup.section.clinic')}>
                <Field id="su-tenant" label={t('signup.field.tenant_name')} className="sm:col-span-2">
                  <input id="su-tenant" className={INPUT_CLASS} value={form.tenant_name} onChange={set('tenant_name')}
                    required minLength={2} maxLength={200} autoComplete="organization" placeholder={t('signup.field.tenant_name_ph')} />
                </Field>
              </Section>

              <Section step={3} title={t('signup.section.location')} hint={t('signup.section.location_hint')}>
                <Field id="su-loc-name" label={t('signup.field.location_name')} className="sm:col-span-2">
                  <input id="su-loc-name" className={INPUT_CLASS} value={form.location_name} onChange={set('location_name')}
                    required minLength={2} maxLength={200} placeholder={t('signup.field.location_name_ph')} />
                </Field>
                <Field id="su-loc-address" label={t('signup.field.location_address')} className="sm:col-span-2">
                  <AddressLookupInput
                    id="su-loc-address"
                    className={INPUT_CLASS}
                    value={form.location_address}
                    onChange={(value) => setForm((f) => ({ ...f, location_address: value }))}
                    suggestionsUrl="/api/address/public-suggestions"
                    required
                    placeholder={t('signup.field.location_address_ph')}
                  />
                </Field>
                <Field id="su-loc-phone" label={t('signup.field.location_phone')}>
                  <input id="su-loc-phone" type="tel" className={INPUT_CLASS} value={form.location_phone} onChange={set('location_phone')}
                    required minLength={7} maxLength={50} autoComplete="tel" placeholder={t('signup.field.location_phone_ph')} />
                </Field>
                <Field id="su-loc-email" label={t('signup.field.location_email')}>
                  <input id="su-loc-email" type="email" className={INPUT_CLASS} value={form.location_email} onChange={set('location_email')}
                    required placeholder={t('signup.field.location_email_ph')} />
                </Field>
              </Section>

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
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || (!!TURNSTILE_SITE_KEY && !captchaToken)}
                className="h-12 w-full rounded-full bg-[#2E6EF3] text-sm font-semibold text-white shadow-[0_10px_30px_rgba(46,110,243,0.35)] transition-colors hover:bg-[#1f5ad2] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
                data-testid="clinic-signup-submit"
              >
                {submitting ? t('signup.submitting') : t('signup.submit')}
              </button>

            </form>
          </>
        )}
      </main>
    </div>
  )
}
