'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter'
import { meetsPasswordCriteria } from '@/lib/security/password-checks'
import { useT } from '@/lib/i18n'

const INPUT_CLASS =
  'w-full h-11 border border-slate-200 rounded-xl px-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] focus:border-transparent transition-shadow'

type Step = 'current' | 'new' | 'saving'

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
  autoComplete,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  placeholder: string
  autoComplete: string
  disabled?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className={INPUT_CLASS}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858 3.03a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18"
              />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

export function ChangePasswordForm() {
  const { t } = useT()
  const [step, setStep] = useState<Step>('current')
  const [currentVerified, setCurrentVerified] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [currentError, setCurrentError] = useState<string | null>(null)

  const resetNewFields = useCallback(() => {
    setNewPassword('')
    setConfirmPassword('')
    setShowNew(false)
    setShowConfirm(false)
  }, [])

  const handleCurrentChange = (value: string) => {
    setCurrentPassword(value)
    if (currentVerified) {
      setCurrentVerified(false)
      resetNewFields()
    }
    setCurrentError(null)
  }

  const verifyCurrent = async () => {
    if (!currentPassword) {
      setCurrentError(t('profile.password_current_required'))
      return
    }
    setVerifying(true)
    setCurrentError(null)
    try {
      const res = await fetch('/api/me/password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword }),
      })
      const data = await res.json()
      if (!res.ok || !data.valid) {
        setCurrentError(data.message || data.error || t('profile.password_incorrect'))
        setCurrentVerified(false)
        resetNewFields()
        return
      }
      setCurrentVerified(true)
      toast.success(t('profile.password_verified'))
    } catch {
      setCurrentError(t('profile.password_verify_failed'))
    } finally {
      setVerifying(false)
    }
  }

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault()
    await verifyCurrent()
  }

  const handleChangeSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentVerified) {
      await verifyCurrent()
      return
    }
    if (!meetsPasswordCriteria(newPassword)) {
      toast.error(t('profile.password_too_weak'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('profile.password_mismatch'))
      return
    }
    if (newPassword === currentPassword) {
      toast.error(t('profile.password_same_as_current'))
      return
    }

    setStep('saving')
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          password_confirm: confirmPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'INVALID_CURRENT_PASSWORD') {
          setCurrentVerified(false)
          resetNewFields()
          setCurrentError(t('profile.password_incorrect'))
        }
        throw new Error(data.error || data.message || t('profile.password_update_failed'))
      }
      toast.success(t('profile.password_updated'))
      setCurrentPassword('')
      setCurrentVerified(false)
      resetNewFields()
      setStep('current')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.password_update_failed'))
      setStep('new')
    }
  }

  const newSectionOpen = currentVerified

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-base font-bold text-slate-900">{t('profile.change_password')}</h2>
      <p className="text-sm text-slate-500 mt-1 mb-5">{t('profile.password_hint')}</p>

      <form onSubmit={currentVerified ? handleChangeSubmit : handleVerifySubmit} className="space-y-4">
        <PasswordField
          id="current-password"
          label={t('profile.current_password')}
          value={currentPassword}
          onChange={handleCurrentChange}
          show={showCurrent}
          onToggleShow={() => setShowCurrent((s) => !s)}
          placeholder={t('profile.current_password_placeholder')}
          autoComplete="current-password"
          disabled={step === 'saving'}
        />
        {currentError && (
          <p className="text-sm text-red-600" role="alert">
            {currentError}
          </p>
        )}
        {currentVerified && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('profile.password_verified')}
          </p>
        )}

        {!currentVerified && (
          <button
            type="submit"
            disabled={verifying || !currentPassword || step === 'saving'}
            className="h-11 w-full rounded-xl bg-[#2E6EF3] text-sm font-semibold text-white hover:bg-[#1f5ad2] disabled:opacity-50 transition-colors"
          >
            {verifying ? t('profile.password_verifying') : t('profile.verify_password')}
          </button>
        )}

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
            newSectionOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          aria-hidden={!newSectionOpen}
        >
          <div className="overflow-hidden">
            <div
              className={`space-y-4 border-t border-slate-100 pt-4 transition-transform duration-300 ${
                newSectionOpen ? 'translate-y-0' : '-translate-y-2'
              }`}
            >
              <PasswordField
                id="new-password"
                label={t('profile.new_password')}
                value={newPassword}
                onChange={setNewPassword}
                show={showNew}
                onToggleShow={() => setShowNew((s) => !s)}
                placeholder={t('profile.new_password_placeholder')}
                autoComplete="new-password"
                disabled={step === 'saving'}
              />
              <PasswordStrengthMeter password={newPassword} t={t} />

              <PasswordField
                id="confirm-password"
                label={t('profile.confirm_password')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirm}
                onToggleShow={() => setShowConfirm((s) => !s)}
                placeholder={t('profile.confirm_password_placeholder')}
                autoComplete="new-password"
                disabled={step === 'saving'}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sm text-amber-600">{t('profile.password_mismatch')}</p>
              )}

              <button
                type="submit"
                disabled={
                  step === 'saving' ||
                  !meetsPasswordCriteria(newPassword) ||
                  newPassword !== confirmPassword
                }
                className="h-11 w-full rounded-xl bg-[#2E6EF3] text-sm font-semibold text-white hover:bg-[#1f5ad2] disabled:opacity-50 transition-colors"
              >
                {step === 'saving' ? t('common.saving') : t('profile.update_password')}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
