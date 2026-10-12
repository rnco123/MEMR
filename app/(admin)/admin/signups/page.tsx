'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { useT } from '@/lib/i18n'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { SignupRequestFields, SignupRequestRow, SignupRequestStatus } from '@/lib/signup-requests/types'

const TABS: SignupRequestStatus[] = ['pending', 'approved', 'rejected']

const FIELD_ORDER: { key: keyof SignupRequestFields; group: 'contact' | 'organization' | 'location' }[] = [
  { key: 'contact_name', group: 'contact' },
  { key: 'email', group: 'contact' },
  { key: 'tenant_name', group: 'organization' },
  { key: 'location_name', group: 'location' },
  { key: 'location_address', group: 'location' },
  { key: 'location_phone', group: 'location' },
  { key: 'location_email', group: 'location' },
]

const INPUT_CLASS =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200'

function pickFields(row: SignupRequestRow): SignupRequestFields {
  return {
    contact_name: row.contact_name,
    email: row.email,
    tenant_name: row.tenant_name,
    location_name: row.location_name,
    location_address: row.location_address,
    location_phone: row.location_phone,
    location_email: row.location_email,
  }
}

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
  return json.error || json.message || `Request failed (${res.status})`
}

function SignupCard({ row, onChanged }: { row: SignupRequestRow; onChanged: () => void }) {
  const { t, language } = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SignupRequestFields>(() => pickFields(row))
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<null | 'save' | 'approve' | 'reject'>(null)

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(language === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const label = (key: keyof SignupRequestFields) => t(`signup.field.${key}`)
  const display = (key: keyof SignupRequestFields) => row[key] as string

  const save = async () => {
    const changed = Object.fromEntries(
      Object.entries(draft).filter(([k, v]) => v.trim() !== String(row[k as keyof SignupRequestFields]))
    )
    if (Object.keys(changed).length === 0) {
      setEditing(false)
      return
    }
    setBusy('save')
    try {
      const res = await fetch(`/api/admin/signup-requests/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      })
      if (!res.ok) throw new Error(await readError(res))
      toast.success(t('admin.signups.saved_toast'))
      setEditing(false)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const act = async (kind: 'approve' | 'reject') => {
    setBusy(kind)
    try {
      const res = await fetch(`/api/admin/signup-requests/${row.id}/${kind}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'reject' && note.trim() ? { note: note.trim() } : {}),
      })
      if (!res.ok) throw new Error(await readError(res))
      toast.success(t(kind === 'approve' ? 'admin.signups.approved_toast' : 'admin.signups.rejected_toast'))
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const groups: { id: 'contact' | 'organization' | 'location'; title: string }[] = [
    { id: 'contact', title: t('admin.signups.contact') },
    { id: 'organization', title: t('admin.signups.organization') },
    { id: 'location', title: t('admin.signups.location') },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{row.tenant_name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('admin.signups.submitted', { date: fmt(row.created_at) })}
            {row.reviewed_at && <> · {t('admin.signups.reviewed', { date: fmt(row.reviewed_at) })}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {row.tenant_id != null && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{t('admin.signups.tenant_id', { id: row.tenant_id })}</span>
          )}
          {row.location_id != null && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{t('admin.signups.location_id', { id: row.location_id })}</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl bg-slate-50 p-3.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</p>
            <dl className="space-y-2">
              {FIELD_ORDER.filter((f) => f.group === g.id).map(({ key }) => (
                <div key={key}>
                  <dt className="text-[11px] text-slate-500">{label(key)}</dt>
                  <dd className="text-sm text-slate-900">
                    {editing ? (
                      <input className={INPUT_CLASS} value={draft[key]}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
                    ) : (
                      <span className="break-words">{display(key)}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {row.review_note && <p className="mt-3 text-sm text-slate-600">“{row.review_note}”</p>}

      {row.status === 'pending' && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {rejecting ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input className={`${INPUT_CLASS} sm:flex-1`} placeholder={t('admin.signups.reject_note')} value={note}
                onChange={(e) => setNote(e.target.value)} maxLength={2000} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setRejecting(false)} disabled={!!busy}
                  className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {t('common.cancel')}
                </button>
                <button type="button" onClick={() => act('reject')} disabled={!!busy}
                  className="h-9 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {t('admin.signups.confirm_reject')}
                </button>
              </div>
            </div>
          ) : editing ? (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setDraft(pickFields(row)); setEditing(false) }} disabled={!!busy}
                className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('common.cancel')}
              </button>
              <button type="button" onClick={save} disabled={!!busy}
                className="h-9 rounded-lg bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60">
                {busy === 'save' ? t('common.saving') : t('common.save')}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEditing(true)} disabled={!!busy}
                className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('admin.signups.edit')}
              </button>
              <button type="button" onClick={() => setRejecting(true)} disabled={!!busy}
                className="h-9 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50">
                {t('admin.signups.reject')}
              </button>
              <button type="button" onClick={() => act('approve')} disabled={!!busy}
                className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {busy === 'approve' ? t('admin.signups.approving') : t('admin.signups.approve')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AdminSignupsPage() {
  const { t } = useT()
  const [tab, setTab] = useState<SignupRequestStatus>('pending')
  const [rows, setRows] = useState<SignupRequestRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/signup-requests?status=${tab}`, { credentials: 'include' })
      if (!res.ok) throw new Error(await readError(res))
      const json = (await res.json()) as { data?: SignupRequestRow[] }
      setRows(json.data ?? [])
    } catch (e) {
      setRows([])
      toast.error(`${t('admin.signups.load_error')} ${e instanceof Error ? e.message : ''}`.trim())
    } finally {
      setLoading(false)
    }
  }, [tab, t])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.signups.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.signups.subtitle')}</p>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((s) => (
          <button key={s} type="button" onClick={() => setTab(s)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === s ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            {t(`admin.signups.tab.${s}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner message={t('common.loading')} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {t('admin.signups.empty')}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <SignupCard key={`${row.id}-${row.updated_at}`} row={row} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(AdminSignupsPage, { allowedRoles: [UserRole.ADMIN] })
