'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth-context'
import { UserRole } from '@/lib/roles'
import { useUserProfile } from '@/lib/user-profile-context'
import { AvatarPicker } from '@/components/AvatarPicker'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { UserAvatar } from '@/components/UserAvatar'
import { useT } from '@/lib/i18n'
import { toast } from 'sonner'

export default function ProfilePage() {
  const { user, role } = useAuth()
  const { t } = useT()
  const { profile, loading, patchProfile, refreshProfile } = useUserProfile()
  const [fullName, setFullName] = useState('')
  const [ein, setEin] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingEin, setSavingEin] = useState(false)
  const isDoctor = profile?.role === UserRole.DOCTOR || role === UserRole.DOCTOR

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? profile.display_name ?? '')
      setEin(profile.ein ?? '')
    }
  }, [profile?.full_name, profile?.display_name, profile?.ein])

  const displayName =
    profile?.display_name ??
    profile?.full_name ??
    user?.user_metadata?.full_name ??
    user?.email ??
    'User'

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = fullName.trim()
    if (trimmed.length < 2) {
      toast.error(t('profile.name_too_short'))
      return
    }
    setSavingName(true)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Failed')
      patchProfile({
        full_name: trimmed,
        display_name: data.display_name ?? trimmed,
      })
      await refreshProfile()
      toast.success(t('profile.name_saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.name_save_failed'))
    } finally {
      setSavingName(false)
    }
  }

  const handleAvatarSaved = async (avatarId: string, avatarUrl: string) => {
    patchProfile({ avatar_id: avatarId, avatar_url: avatarUrl })
    await refreshProfile()
  }

  const saveEin = async (e: FormEvent) => {
    e.preventDefault()
    setSavingEin(true)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ein: ein.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Failed')
      patchProfile({ ein: data.ein ?? null })
      setEin(data.ein ?? '')
      await refreshProfile()
      toast.success(t('profile.ein_saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.ein_save_failed'))
    } finally {
      setSavingEin(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('profile.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('profile.subtitle')}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 flex items-center gap-4">
        <UserAvatar
          key={profile?.avatar_id ?? 'no-avatar'}
          name={displayName}
          avatarId={profile?.avatar_id}
          avatarUrl={profile?.avatar_url}
          size="lg"
          ringClassName="ring-2 ring-[#2E6EF3]/30"
        />
        <div>
          <p className="text-lg font-semibold text-slate-900">{displayName}</p>
          <p className="text-sm text-slate-500">{profile?.email || user?.email}</p>
          <p className="text-xs text-slate-400 capitalize mt-0.5">{profile?.role || role}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
        <h2 className="text-base font-bold text-slate-900 mb-3">{t('profile.display_name')}</h2>
        <form onSubmit={saveName} className="flex flex-wrap gap-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t('profile.name_placeholder')}
            className="flex-1 min-w-[200px] h-10 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            required
            minLength={2}
          />
          <button
            type="submit"
            disabled={savingName}
            className="h-10 px-4 rounded-lg bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] disabled:opacity-50"
          >
            {savingName ? t('common.saving') : t('common.save')}
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">{t('profile.name_hint')}</p>
      </div>

      {isDoctor && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
          <h2 className="text-base font-bold text-slate-900 mb-1">{t('profile.ein')}</h2>
          <p className="text-xs text-slate-500 mb-3">{t('profile.ein_hint')}</p>
          <form onSubmit={saveEin} className="flex flex-wrap gap-2">
            <input
              value={ein}
              onChange={(e) => setEin(e.target.value)}
              placeholder={t('profile.ein_placeholder')}
              className="flex-1 min-w-[200px] h-10 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
              inputMode="numeric"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={savingEin}
              className="h-10 px-4 rounded-lg bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] disabled:opacity-50"
            >
              {savingEin ? t('common.saving') : t('common.save')}
            </button>
          </form>
        </div>
      )}

      <div className="mb-4">
        <ChangePasswordForm />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">{t('profile.choose_avatar')}</h2>
        {loading && !profile ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <AvatarPicker
            currentAvatarId={profile?.avatar_id ?? null}
            onSaved={handleAvatarSaved}
          />
        )}
      </div>
    </div>
  )
}
