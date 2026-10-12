'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConsentFormHtmlEditor } from '@/components/ConsentFormHtmlEditor'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { isConsentFormHtmlEmpty } from '@/lib/forms/consent-placeholders'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { useT } from '@/lib/i18n'
import { UserRole } from '@/lib/roles'

type FormRow = {
  id: number
  name: string
  is_active: boolean
  html: string
  updated_at: string | null
  updated_by_name: string | null
}

type Draft = { name: string; html: string; is_active: boolean }

const INPUT =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#2E6EF3] focus:outline-none focus:ring-4 focus:ring-[#2E6EF3]/15'

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return json.error || `Request failed (${res.status})`
}

function FormEditor({
  initial,
  saving,
  onSave,
  onCancel,
  editorKey,
}: {
  initial: Draft
  saving: boolean
  onSave: (d: Draft) => void
  onCancel: () => void
  editorKey: string
}) {
  const { t } = useT()
  const [d, setD] = useState(initial)
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('admin.forms.name')}</label>
        <input className={INPUT} value={d.name} maxLength={200} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">{t('admin.forms.content')}</p>
        <ConsentFormHtmlEditor key={editorKey} value={d.html} onChange={(html) => setD((prev) => ({ ...prev, html }))} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={d.is_active} onChange={(e) => setD({ ...d, is_active: e.target.checked })} />
        {t('admin.forms.active')}
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            if (!d.name.trim() || isConsentFormHtmlEmpty(d.html)) {
              toast.error(t('admin.forms.validation_required'))
              return
            }
            onSave({ ...d, name: d.name.trim() })
          }}
          className="h-10 rounded-lg bg-[#2E6EF3] px-5 text-sm font-semibold text-white hover:bg-[#1f5ad2] disabled:opacity-60"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}

function ManageFormsPage() {
  const { t } = useT()
  const [rows, setRows] = useState<FormRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/manage/forms', { credentials: 'include' })
      if (!res.ok) throw new Error(await readError(res))
      setRows(((await res.json()) as { data: FormRow[] }).data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const send = async (url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>, okKey = 'manage.saved') => {
    setSaving(true)
    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (!res.ok) throw new Error(await readError(res))
      toast.success(t(okKey))
      setAdding(false)
      setEditingId(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('manage.forms.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('manage.forms.subtitle')}</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="h-10 rounded-lg bg-[#2E6EF3] px-4 text-sm font-semibold text-white hover:bg-[#1f5ad2]">
            + {t('admin.forms.add')}
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <FormEditor
            editorKey="new"
            initial={{ name: '', html: '', is_active: true }}
            saving={saving}
            onCancel={() => setAdding(false)}
            onSave={(d) => send('/api/manage/forms', 'POST', d)}
          />
        </div>
      )}

      {loading ? (
        <LoadingSpinner message={t('common.loading')} />
      ) : rows.length === 0 && !adding ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {t('manage.forms.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((form) => (
            <div key={form.id} className={`rounded-2xl border border-slate-200 bg-white p-5 ${form.is_active ? '' : 'opacity-75'}`}>
              {editingId === form.id ? (
                <FormEditor
                  editorKey={`edit-${form.id}`}
                  initial={{ name: form.name, html: form.html, is_active: form.is_active }}
                  saving={saving}
                  onCancel={() => setEditingId(null)}
                  onSave={(d) => send(`/api/manage/forms/${form.id}`, 'PATCH', d)}
                />
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{form.name}</p>
                      {!form.is_active && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{t('admin.forms.inactive')}</span>
                      )}
                    </div>
                    {form.updated_by_name && <p className="mt-0.5 text-xs text-slate-500">{form.updated_by_name}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => setEditingId(form.id)} disabled={saving}
                      className="h-9 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      {t('admin.signups.edit')}
                    </button>
                    <button type="button" disabled={saving}
                      onClick={() => send(`/api/manage/forms/${form.id}`, 'PATCH', { is_active: !form.is_active })}
                      className="h-9 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      {form.is_active ? t('manage.staff.deactivate') : t('manage.staff.activate')}
                    </button>
                    {!form.is_active && (
                      <button type="button" disabled={saving}
                        onClick={() => {
                          if (window.confirm(t('manage.forms.confirm_delete', { name: form.name }))) {
                            void send(`/api/manage/forms/${form.id}`, 'DELETE', undefined, 'manage.forms.deleted')
                          }
                        }}
                        className="h-9 rounded-lg border border-red-200 px-3.5 text-sm font-medium text-red-600 hover:bg-red-50">
                        {t('manage.forms.delete')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(ManageFormsPage, { allowedRoles: [UserRole.CLINIC_MANAGER] })
