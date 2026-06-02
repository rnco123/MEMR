'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { isStaffAvatarId } from '@/lib/avatars/catalog'

type AvatarOption = {
  id: string
  label: string
  gender: string
  roleLabel: string
  url: string
}

type AvatarPickerProps = {
  currentAvatarId: string | null
  onSaved?: (avatarId: string, avatarUrl: string) => void
}

export function AvatarPicker({ currentAvatarId, onSaved }: AvatarPickerProps) {
  const [avatars, setAvatars] = useState<AvatarOption[]>([])
  const [selected, setSelected] = useState<string | null>(currentAvatarId)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(currentAvatarId)
  }, [currentAvatarId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/avatars')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load avatars')
        if (!cancelled) setAvatars(data.avatars ?? [])
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load avatars')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const save = async () => {
    if (!selected || !isStaffAvatarId(selected)) {
      toast.error('Please select an avatar')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_id: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Save failed')
      const picked = avatars.find((a) => a.id === selected)
      toast.success('Avatar updated')
      onSaved?.(selected, data.avatar_url ?? picked?.url ?? '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading avatars…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Choose a healthcare worker avatar. Your selection is saved to your profile.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {avatars.map((a) => {
          const isSelected = selected === a.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              className={`relative flex flex-col items-center rounded-2xl border-2 p-3 transition-all ${
                isSelected
                  ? 'border-purple-600 bg-purple-50 shadow-md ring-2 ring-purple-200'
                  : 'border-slate-200 bg-white hover:border-purple-300 hover:shadow-sm'
              }`}
            >
              <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.label} className="h-full w-full object-cover" />
              </div>
              <span className="mt-2 text-xs font-semibold text-slate-900">{a.roleLabel}</span>
              <span className="text-[10px] text-slate-500 capitalize">{a.gender}</span>
              {isSelected && (
                <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-white text-[10px]">
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        disabled={saving || !selected || selected === currentAvatarId}
        onClick={save}
        className="h-10 px-5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save avatar'}
      </button>
    </div>
  )
}
