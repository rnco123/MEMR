'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AddressLookupInput } from '@/components/AddressLookupInput'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { useT } from '@/lib/i18n'
import { UserRole } from '@/lib/roles'

type Location = {
  id: number
  title: string
  address: string | null
  phone: string | null
  email: string | null
  is_active: boolean
}

type Draft = { title: string; address: string; phone: string; email: string }

const INPUT =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#2E6EF3] focus:outline-none focus:ring-4 focus:ring-[#2E6EF3]/15'

const toDraft = (l?: Location): Draft => ({
  title: l?.title ?? '',
  address: l?.address ?? '',
  phone: l?.phone ?? '',
  email: l?.email ?? '',
})

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return json.error || `Request failed (${res.status})`
}

function LocationForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: Draft
  saving: boolean
  onSave: (d: Draft) => void
  onCancel: () => void
}) {
  const { t } = useT()
  const [d, setD] = useState(initial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(d)
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <input className={`${INPUT} sm:col-span-2`} required minLength={2} placeholder={t('signup.field.location_name')}
        value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
      <div className="sm:col-span-2">
        <AddressLookupInput className={INPUT} value={d.address} placeholder={t('signup.field.location_address')}
          onChange={(address) => setD({ ...d, address })} />
      </div>
      <input className={INPUT} type="tel" placeholder={t('signup.field.location_phone')}
        value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
      <input className={INPUT} type="email" placeholder={t('signup.field.location_email')}
        value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving} className="h-10 rounded-lg bg-[#2E6EF3] px-5 text-sm font-semibold text-white hover:bg-[#1f5ad2] disabled:opacity-60">
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}

function ManageLocationsPage() {
  const { t } = useT()
  const [rows, setRows] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/manage/locations', { credentials: 'include' })
      if (!res.ok) throw new Error(await readError(res))
      setRows(((await res.json()) as { data: Location[] }).data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await readError(res))
      toast.success(t('manage.saved'))
      setAdding(false)
      setEditingId(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const clean = (d: Draft) => ({
    title: d.title.trim(),
    address: d.address.trim() || null,
    phone: d.phone.trim() || null,
    email: d.email.trim() || null,
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('manage.locations.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('manage.locations.subtitle')}</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="h-10 rounded-lg bg-[#2E6EF3] px-4 text-sm font-semibold text-white hover:bg-[#1f5ad2]">
            + {t('manage.locations.add')}
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <LocationForm initial={toDraft()} saving={saving} onCancel={() => setAdding(false)}
            onSave={(d) => save('/api/manage/locations', 'POST', { ...clean(d), is_active: true })} />
        </div>
      )}

      {loading ? (
        <LoadingSpinner message={t('common.loading')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((loc) => (
            <div key={loc.id} className={`rounded-2xl border border-slate-200 bg-white p-5 ${loc.is_active ? '' : 'opacity-70'}`}>
              {editingId === loc.id ? (
                <LocationForm initial={toDraft(loc)} saving={saving} onCancel={() => setEditingId(null)}
                  onSave={(d) => save(`/api/manage/locations/${loc.id}`, 'PATCH', clean(d))} />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-slate-900">{loc.title}</p>
                    {!loc.is_active && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('manage.staff.inactive')}</span>
                    )}
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-slate-600">
                    <dd>{loc.address || '—'}</dd>
                    <dd>{[loc.phone, loc.email].filter(Boolean).join(' · ') || '—'}</dd>
                  </dl>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => setEditingId(loc.id)}
                      className="h-9 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      {t('admin.signups.edit')}
                    </button>
                    <button type="button" disabled={saving}
                      onClick={() => save(`/api/manage/locations/${loc.id}`, 'PATCH', { is_active: !loc.is_active })}
                      className="h-9 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      {loc.is_active ? t('manage.staff.deactivate') : t('manage.staff.activate')}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(ManageLocationsPage, { allowedRoles: [UserRole.CLINIC_MANAGER] })
