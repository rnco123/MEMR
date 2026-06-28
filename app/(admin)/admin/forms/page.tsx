'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useT } from '@/lib/i18n'
import type { TenantRow } from '@/lib/tenants/types'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'
import { toast } from 'sonner'
import { ConsentFormHtmlEditor } from '@/components/ConsentFormHtmlEditor'
import { isConsentFormHtmlEmpty } from '@/lib/forms/consent-placeholders'
import { buildTenantFormTemplateGap } from '@/lib/forms/form-template-gap'

type FormRow = {
  id: number
  tenant_id: number
  name: string
  is_active: boolean
  html: string
  content_updated_at: string | null
  created_at: string | null
  updated_at: string | null
}

type CreateMode = 'pick' | 'new' | 'copy'

const blankForm = (tenantId: number) => ({
  name: '',
  is_active: true,
  html: '',
  tenant_id: tenantId,
})

function AdminFormsPage() {
  const { t, language } = useT()
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [tenantId, setTenantId] = useState<number>(1)
  const [rows, setRows] = useState<FormRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createMode, setCreateMode] = useState<CreateMode>('pick')
  const [allForms, setAllForms] = useState<FormRow[]>([])
  const [formCountByTenant, setFormCountByTenant] = useState<Record<number, number>>({})
  const [loadingAllForms, setLoadingAllForms] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<number | ''>('')
  const [createForm, setCreateForm] = useState(blankForm(1))
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(blankForm(1))
  const [saving, setSaving] = useState(false)

  const formCountLabel = useCallback(
    (count: number) => (count === 1 ? t('admin.forms.form_count_one') : t('admin.forms.form_count', { count: String(count) })),
    [t]
  )

  const refreshAllForms = useCallback(async () => {
    const res = await fetch('/api/admin/forms', { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || t('admin.forms.load_failed'))
    const list = (json.data ?? []) as FormRow[]
    setAllForms(list)
    const counts: Record<number, number> = {}
    for (const form of list) {
      counts[form.tenant_id] = (counts[form.tenant_id] ?? 0) + 1
    }
    setFormCountByTenant(counts)
    return list
  }, [t])

  const tenantNameById = useCallback(
    (id: number) => {
      const tenant = tenants.find((x) => x.id === id)
      return tenant ? `${tenant.name} (${tenant.tenant_code})` : String(id)
    },
    [tenants]
  )

  const resetCreatePanel = useCallback(() => {
    setShowCreate(false)
    setCreateMode('pick')
    setSelectedSourceId('')
    setCreateForm(blankForm(tenantId))
  }, [tenantId])

  const loadTenants = useCallback(async () => {
    const res = await fetch('/api/admin/tenants', { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load tenants')
    const list = (json.data ?? []) as TenantRow[]
    setTenants(list)
    if (list.length > 0) {
      setTenantId(list[0]!.id)
      setCreateForm(blankForm(list[0]!.id))
    }
  }, [])

  const loadForms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/forms?tenant_id=${tenantId}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.forms.load_failed'))
      setRows((json.data ?? []) as FormRow[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.forms.load_failed'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tenantId, t])

  const loadAllForms = useCallback(async () => {
    if (allForms.length > 0) return allForms
    setLoadingAllForms(true)
    try {
      return await refreshAllForms()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.forms.load_failed'))
      return []
    } finally {
      setLoadingAllForms(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on allForms.length (not the array reference) so this callback stays stable unless the count actually changes.
  }, [allForms.length, refreshAllForms, t])

  useEffect(() => {
    void loadTenants().catch((e) => console.error(e))
    void refreshAllForms().catch((e) => console.error(e))
  }, [loadTenants, refreshAllForms])

  useEffect(() => {
    if (tenantId > 0) void loadForms()
  }, [tenantId, loadForms])

  useEffect(() => {
    setCreateForm((prev) => ({ ...prev, tenant_id: tenantId }))
  }, [tenantId])

  const openCreatePanel = () => {
    setShowCreate(true)
    setCreateMode('pick')
    setSelectedSourceId('')
    setCreateForm(blankForm(tenantId))
  }

  const startCreateNew = () => {
    setCreateMode('new')
    setSelectedSourceId('')
    setCreateForm(blankForm(tenantId))
  }

  const startCreateFromExisting = async () => {
    setCreateMode('copy')
    setSelectedSourceId('')
    setCreateForm(blankForm(tenantId))
    const list = await loadAllForms()
    if (list.length === 0) {
      toast.message(t('admin.forms.choose_existing_empty'))
    }
  }

  const onSelectSourceForm = (rawId: string | number) => {
    if (rawId === '' || rawId == null) {
      setSelectedSourceId('')
      setCreateForm(blankForm(tenantId))
      return
    }
    const id = Number(rawId)
    const source = allForms.find((f) => f.id === id)
    if (!source) return
    setSelectedSourceId(id)
    setCreateForm({
      tenant_id: tenantId,
      name: source.name,
      is_active: true,
      html: source.html,
    })
  }

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.name.trim() || isConsentFormHtmlEmpty(createForm.html)) {
      toast.error(t('admin.forms.validation_required'))
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/forms', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          name: createForm.name.trim(),
          is_active: createForm.is_active,
          html: createForm.html,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.forms.create_failed'))
      toast.success(t('admin.forms.created'))
      resetCreatePanel()
      await Promise.all([loadForms(), refreshAllForms()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.forms.create_failed'))
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (row: FormRow) => {
    setEditingId(row.id)
    setEditForm({
      name: row.name,
      is_active: row.is_active,
      html: row.html,
      tenant_id: row.tenant_id,
    })
  }

  const submitEdit = async () => {
    if (editingId == null) return
    if (!editForm.name.trim() || isConsentFormHtmlEmpty(editForm.html)) {
      toast.error(t('admin.forms.validation_required'))
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/forms/${editingId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          is_active: editForm.is_active,
          html: editForm.html,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.forms.save_failed'))
      toast.success(t('admin.forms.saved'))
      setEditingId(null)
      await Promise.all([loadForms(), refreshAllForms()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.forms.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (row: FormRow) => {
    if (!window.confirm(t('admin.forms.deactivate_confirm', { name: row.name }))) return
    try {
      const res = await fetch(`/api/admin/forms/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.forms.save_failed'))
      toast.success(t('admin.forms.deactivated'))
      await Promise.all([loadForms(), refreshAllForms()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.forms.save_failed'))
    }
  }

  const tenantLabel = tenants.find((x) => x.id === tenantId)?.name ?? String(tenantId)
  const selectedTenantFormCount = formCountByTenant[tenantId] ?? rows.length
  const selectedSource = allForms.find((f) => f.id === selectedSourceId)
  const templateGap = useMemo(
    () => buildTenantFormTemplateGap(tenantId, allForms),
    [tenantId, allForms]
  )
  const copyOptions = templateGap.missing

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.forms.title')}</h1>
        <p className="text-sm text-slate-600 mt-1">{t('admin.forms.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('admin.forms.tenant')}</span>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 min-w-[260px]"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.tenant_code}) — {formCountLabel(formCountByTenant[tenant.id] ?? 0)}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {formCountLabel(selectedTenantFormCount)}
          </span>
        </label>
        <button
          type="button"
          onClick={() => (showCreate ? resetCreatePanel() : openCreatePanel())}
          className="ml-auto rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          {showCreate ? t('common.cancel') : t('admin.forms.add')}
        </button>
      </div>

      {showCreate && createMode === 'pick' && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-5 space-y-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">{t('admin.forms.add_mode_title')}</h2>
          <p className="text-sm text-slate-600">
            {t('admin.forms.add_for_tenant', { tenant: tenantLabel })}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={startCreateNew}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-violet-300 hover:bg-violet-50/50 transition-colors"
            >
              <p className="font-semibold text-slate-900">{t('admin.forms.add_mode_new')}</p>
              <p className="mt-1 text-sm text-slate-600">{t('admin.forms.add_mode_new_hint')}</p>
            </button>
            <button
              type="button"
              onClick={() => void startCreateFromExisting()}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-violet-300 hover:bg-violet-50/50 transition-colors"
            >
              <p className="font-semibold text-slate-900">{t('admin.forms.add_mode_copy')}</p>
              <p className="mt-1 text-sm text-slate-600">{t('admin.forms.add_mode_copy_hint')}</p>
            </button>
          </div>
        </div>
      )}

      {showCreate && (createMode === 'new' || createMode === 'copy') && (
        <form
          onSubmit={submitCreate}
          className="rounded-xl border border-violet-200 bg-violet-50/40 p-5 space-y-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              {t('admin.forms.add_for_tenant', { tenant: tenantLabel })}
            </h2>
            <button
              type="button"
              onClick={() => setCreateMode('pick')}
              className="text-sm text-violet-700 hover:underline"
            >
              ← {t('admin.forms.add_mode_title')}
            </button>
          </div>

          {createMode === 'copy' && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                <h3 className="font-semibold text-slate-900">
                  {t('admin.forms.gap_title', { tenant: tenantLabel })}
                </h3>

                {loadingAllForms ? (
                  <p className="text-slate-500">{t('admin.forms.loading')}</p>
                ) : allForms.length === 0 ? (
                  <p className="text-slate-500">{t('admin.forms.choose_existing_empty')}</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="font-medium text-slate-700 mb-2">
                        {t('admin.forms.gap_has')} ({templateGap.has.length})
                      </p>
                      {templateGap.has.length === 0 ? (
                        <p className="text-xs text-slate-500">—</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {templateGap.has.map((form) => (
                            <li
                              key={form.id}
                              className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/60 px-2.5 py-1.5 text-slate-800"
                            >
                              <span className="text-emerald-600" aria-hidden>
                                ✓
                              </span>
                              <span className="flex-1">{form.name}</span>
                              {!form.is_active && (
                                <span className="text-xs text-slate-500">{t('admin.forms.inactive')}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="font-medium text-slate-700 mb-1">
                        {t('admin.forms.gap_missing')} ({templateGap.missing.length})
                      </p>
                      <p className="text-xs text-slate-500 mb-2">{t('admin.forms.gap_missing_hint')}</p>
                      {templateGap.missing.length === 0 ? (
                        <p className="text-xs text-emerald-700 rounded-md border border-emerald-100 bg-emerald-50/60 px-2.5 py-2">
                          {t('admin.forms.gap_none_missing')}
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {templateGap.missing.map((item) => (
                            <li
                              key={item.templateName}
                              className={`rounded-md border px-2.5 py-2 ${
                                selectedSourceId === item.source.id
                                  ? 'border-violet-300 bg-violet-50'
                                  : 'border-amber-100 bg-amber-50/50'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="font-medium text-slate-900">{item.templateName}</p>
                                  <p className="text-xs text-slate-500">
                                    {t('admin.forms.gap_from', {
                                      tenant: tenantNameById(item.source.tenant_id),
                                    })}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onSelectSourceForm(item.source.id)}
                                  className="rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
                                >
                                  {t('admin.forms.gap_copy')}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {copyOptions.length > 0 && (
                <label className="block">
                  <span className="font-medium text-slate-700">{t('admin.forms.choose_existing')}</span>
                  <select
                    value={selectedSourceId === '' ? '' : String(selectedSourceId)}
                    onChange={(e) => onSelectSourceForm(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">{t('admin.forms.choose_existing_placeholder')}</option>
                    {copyOptions.map((item) => (
                      <option key={item.source.id} value={item.source.id}>
                        {item.templateName} — {tenantNameById(item.source.tenant_id)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {selectedSource && (
                <p className="text-xs text-slate-500">
                  {t('admin.forms.copy_from', {
                    name: selectedSource.name,
                    tenant: tenantNameById(selectedSource.tenant_id),
                  })}
                </p>
              )}
            </div>
          )}

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t('admin.forms.name')}</span>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(e) => setCreateForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            {t('admin.forms.active')}
          </label>
          <div className="block text-sm">
            <span className="font-medium text-slate-700">{t('admin.forms.content')}</span>
            <ConsentFormHtmlEditor
              key={`create-${tenantId}-${selectedSourceId}`}
              value={createForm.html}
              onChange={(html) => setCreateForm((f) => ({ ...f, html }))}
            />
          </div>
          <button
            type="submit"
            disabled={creating || (createMode === 'copy' && selectedSourceId === '')}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {creating ? t('common.saving') : t('admin.forms.create')}
          </button>
        </form>
      )}

      {loading ? (
        <LoadingSpinner message={t('admin.forms.loading')} />
      ) : rows.length === 0 ? (
        <p className="text-slate-600 text-sm rounded-xl border border-slate-200 bg-white p-6">
          {t('admin.forms.empty', { tenant: tenantLabel })}
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              {editingId === row.id ? (
                <div className="space-y-3">
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.is_active}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    {t('admin.forms.active')}
                  </label>
                  <div className="text-sm">
                    <span className="font-medium text-slate-700">{t('admin.forms.content')}</span>
                    <ConsentFormHtmlEditor
                      key={editingId ?? 'edit'}
                      value={editForm.html}
                      onChange={(html) => setEditForm((f) => ({ ...f, html }))}
                      minHeightClass="min-h-[320px]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void submitEdit()}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {saving ? t('common.saving') : t('common.save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{row.name}</h3>
                      <p className="text-xs text-slate-500">
                        ID {row.id}
                        {!row.is_active ? ` · ${t('admin.forms.inactive')}` : ''}
                        {(row.updated_at ?? row.content_updated_at ?? row.created_at) && (
                          <>
                            {' · '}
                            {t('admin.forms.last_edited', {
                              when: formatClinicDateTimeForLanguage(
                                row.updated_at ?? row.content_updated_at ?? row.created_at!,
                                language
                              ),
                            })}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        {t('common.edit')}
                      </button>
                      {row.is_active && (
                        <button
                          type="button"
                          onClick={() => void deactivate(row)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                        >
                          {t('admin.forms.deactivate')}
                        </button>
                      )}
                    </div>
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

export default withRoleProtection(AdminFormsPage, { allowedRoles: [UserRole.ADMIN] })
