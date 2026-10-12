'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { useT } from '@/lib/i18n'
import { ADMIN_STAFF_ROLE_VALUES, UserRole, type AdminStaffRoleValue } from '@/lib/roles'

type Loc = { id: number; title: string }
type Staff = {
  uid: string
  role: AdminStaffRoleValue
  full_name: string | null
  email: string | null
  active: boolean
  locations: Loc[]
}

const INPUT =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#2E6EF3] focus:outline-none focus:ring-4 focus:ring-[#2E6EF3]/15'

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return json.error || `Request failed (${res.status})`
}

function RolePills({ value, onChange }: { value: string; onChange: (role: AdminStaffRoleValue) => void }) {
  const { t } = useT()
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {ADMIN_STAFF_ROLE_VALUES.map((role) => (
        <button
          key={role}
          type="button"
          role="radio"
          aria-checked={value === role}
          onClick={() => onChange(role)}
          className={`h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${
            value === role
              ? 'border-[#2E6EF3] bg-[#2E6EF3] text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          {t(`signup.role_card.${role}.title`)}
        </button>
      ))}
    </div>
  )
}

function LocationChips({ all, value, onChange }: { all: Loc[]; value: number[]; onChange: (ids: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((loc) => {
        const on = value.includes(loc.id)
        return (
          <button
            key={loc.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((id) => id !== loc.id) : [...value, loc.id])}
            className={`h-9 rounded-lg border px-3 text-sm transition-colors ${
              on ? 'border-[#2E6EF3] bg-[#2E6EF3]/[0.08] font-medium text-[#2E6EF3]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {loc.title}
          </button>
        )
      })}
    </div>
  )
}

function AddStaffForm({ locations, onDone }: { locations: Loc[]; onDone: () => void }) {
  const { t } = useT()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '' as string, location_ids: [] as number[] })
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.role || form.location_ids.length === 0) {
      toast.error(t('manage.staff.need_role_location'))
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/manage/staff', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await readError(res))
      toast.success(t('manage.staff.added'))
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <input className={INPUT} required minLength={2} placeholder={t('signup.field.contact_name')} value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <input className={INPUT} required type="email" placeholder={t('signup.field.email')} value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <input className={INPUT} required type="password" autoComplete="new-password" placeholder={t('signup.field.password')}
          value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
      </div>
      <p className="text-xs text-slate-500">{t('manage.staff.password_hint')}</p>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{t('signup.field.role')}</p>
        <RolePills value={form.role} onChange={(role) => setForm((f) => ({ ...f, role }))} />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{t('manage.nav.locations')}</p>
        <LocationChips all={locations} value={form.location_ids} onChange={(location_ids) => setForm((f) => ({ ...f, location_ids }))} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving} className="h-10 rounded-lg bg-[#2E6EF3] px-5 text-sm font-semibold text-white hover:bg-[#1f5ad2] disabled:opacity-60">
          {saving ? t('common.saving') : t('manage.staff.add')}
        </button>
      </div>
    </form>
  )
}

function StaffCard({ staff, locations, onChanged }: { staff: Staff; locations: Loc[]; onChanged: () => void }) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    full_name: staff.full_name ?? '',
    role: staff.role as string,
    location_ids: staff.locations.map((l) => l.id),
  })
  const [busy, setBusy] = useState(false)

  const patch = async (body: Record<string, unknown>, okKey: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/manage/staff', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: staff.uid, ...body }),
      })
      if (!res.ok) throw new Error(await readError(res))
      toast.success(t(okKey))
      setEditing(false)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 sm:p-5 ${staff.active ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
      {editing ? (
        <div className="space-y-4">
          <input className={INPUT} value={draft.full_name} onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))} />
          <RolePills value={draft.role} onChange={(role) => setDraft((d) => ({ ...d, role }))} />
          <LocationChips all={locations} value={draft.location_ids} onChange={(location_ids) => setDraft((d) => ({ ...d, location_ids }))} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700">
              {t('common.cancel')}
            </button>
            <button type="button" disabled={busy || draft.location_ids.length === 0}
              onClick={() => patch({ full_name: draft.full_name, role: draft.role, location_ids: draft.location_ids }, 'manage.saved')}
              className="h-9 rounded-lg bg-[#2E6EF3] px-4 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{staff.full_name || staff.email}</p>
              <span className="rounded-full bg-[#2E6EF3]/10 px-2 py-0.5 text-xs font-medium text-[#2E6EF3]">
                {t(`signup.role_card.${staff.role}.title`)}
              </span>
              {!staff.active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{t('manage.staff.inactive')}</span>
              )}
            </div>
            <p className="truncate text-sm text-slate-500">{staff.email}</p>
            <p className="mt-1 text-xs text-slate-500">{staff.locations.map((l) => l.title).join(' · ') || '—'}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setEditing(true)} disabled={busy}
              className="h-9 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t('admin.signups.edit')}
            </button>
            <button type="button" disabled={busy}
              onClick={() => patch({ active: !staff.active }, staff.active ? 'manage.staff.deactivated' : 'manage.staff.activated')}
              className={`h-9 rounded-lg border px-3.5 text-sm font-medium ${staff.active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>
              {staff.active ? t('manage.staff.deactivate') : t('manage.staff.activate')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ManageStaffPage() {
  const { t } = useT()
  const [staff, setStaff] = useState<Staff[]>([])
  const [locations, setLocations] = useState<Loc[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/manage/staff', { credentials: 'include' })
      if (!res.ok) throw new Error(await readError(res))
      const json = (await res.json()) as { staff: Staff[]; locations: Loc[] }
      setStaff(json.staff ?? [])
      setLocations(json.locations ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('manage.staff.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('manage.staff.subtitle')}</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="h-10 rounded-lg bg-[#2E6EF3] px-4 text-sm font-semibold text-white hover:bg-[#1f5ad2]">
            + {t('manage.staff.add')}
          </button>
        )}
      </div>

      {adding && <AddStaffForm locations={locations} onDone={() => { setAdding(false); load() }} />}

      {loading ? (
        <LoadingSpinner message={t('common.loading')} />
      ) : staff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {t('manage.staff.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((s) => (
            <StaffCard key={`${s.uid}-${s.role}-${s.active}-${s.locations.length}`} staff={s} locations={locations} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(ManageStaffPage, { allowedRoles: [UserRole.CLINIC_MANAGER] })
