'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { useCallback, useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { phoneDigitsOnly } from '@/lib/phone-digits'

type Pharmacy = {
  id: number
  name: string | null
  address: string | null
  phone: string | null
  email: string | null
  created_at: string
  updated_at: string
  linked_encounter_count?: number
}

const blankPharmacyForm = { name: '', address: '', phone: '', email: '' }

function PharmaciesPage() {
  const { t } = useT()
  const [rows, setRows] = useState<Pharmacy[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [createForm, setCreateForm] = useState(blankPharmacyForm)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(blankPharmacyForm)
  const [editSaving, setEditSaving] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [contactFilter, setContactFilter] = useState<'all' | 'with-contact' | 'missing-contact'>('all')
  const [sortBy, setSortBy] = useState<'updated_desc' | 'name_asc' | 'name_desc'>('updated_desc')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [deleteTarget, setDeleteTarget] = useState<Pharmacy | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const loadPharmacies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search: debouncedSearch.trim(),
        contactFilter,
        sort: sortBy,
      })
      const res = await fetch(`/api/pharmacies?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_load_failed'))
      setRows(json.data ?? [])
      setTotalCount(json.total ?? 0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [t, page, pageSize, debouncedSearch, contactFilter, sortBy])

  useEffect(() => {
    loadPharmacies()
  }, [loadPharmacies])

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/pharmacies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          address: createForm.address.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_create_failed'))
      toast.success(t('pharmacies.toast_created'))
      setCreateForm(blankPharmacyForm)
      setShowCreateForm(false)
      await loadPharmacies()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_create_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (p: Pharmacy) => {
    setEditingId(p.id)
    setEditForm({
      name: p.name ?? '',
      address: p.address ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
    })
  }

  const submitEdit = async (id: number) => {
    setEditSaving(true)
    try {
      const res = await fetch(`/api/pharmacies/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          address: editForm.address.trim() || null,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_update_failed'))
      toast.success(t('pharmacies.toast_updated'))
      setEditingId(null)
      await loadPharmacies()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_update_failed'))
    } finally {
      setEditSaving(false)
    }
  }

  const confirmDeletePharmacy = async () => {
    if (!deleteTarget) return
    const linked = deleteTarget.linked_encounter_count ?? 0
    setDeleteSubmitting(true)
    try {
      const res = await fetch(`/api/pharmacies/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_delete_failed'))
      const delinked = Number(json.delinked_encounter_count ?? linked)
      toast.success(
        delinked > 0
          ? t('pharmacies.toast_deleted_delinked', { count: delinked })
          : t('pharmacies.toast_deleted')
      )
      if (editingId === deleteTarget.id) setEditingId(null)
      setDeleteTarget(null)
      await loadPharmacies()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_delete_failed'))
    } finally {
      setDeleteSubmitting(false)
    }
  }

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, contactFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <h1 className="text-3xl font-bold text-slate-900">{t('pharmacies.title')}</h1>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            {showCreateForm ? t('common.cancel') : t('pharmacies.add_title')}
          </button>
        </div>
        <p className="text-slate-600 text-sm max-w-3xl">
          Manage pharmacies, contact details, and activation status in one place.
        </p>
      </div>

      {showCreateForm && (
        <form
          onSubmit={submitCreate}
          className="bg-white border border-violet-100 shadow-sm rounded-2xl p-6 mb-8 space-y-4"
        >
          <h2 className="text-lg font-semibold text-slate-900">{t('pharmacies.add_title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-700">{t('pharmacies.name_req')}</label>
              <input
                required
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                placeholder={t('pharmacies.name_placeholder')}
              />
            </div>
            <div>
              <label className="text-sm text-slate-700">{t('pharmacies.phone')}</label>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                value={createForm.phone}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: phoneDigitsOnly(e.target.value) }))}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                placeholder={t('pharmacies.phone_placeholder')}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-slate-700">{t('pharmacies.address')}</label>
              <input
                value={createForm.address}
                onChange={(e) => setCreateForm((f) => ({ ...f, address: e.target.value }))}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-slate-700">{t('pharmacies.email')}</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                placeholder={t('pharmacies.email_placeholder_form')}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? t('common.saving') : t('pharmacies.save_pharmacy')}
          </button>
        </form>
      )}

      <div className="bg-white border border-violet-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-violet-100">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{t('pharmacies.list_title')}</h2>
            <span className="text-xs text-slate-500">
              {t('pharmacies.total_count', { count: totalCount.toLocaleString() })}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, id, phone, email"
              className="xl:col-span-2 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
            />
            <select
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value as typeof contactFilter)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All pharmacies</option>
              <option value="with-contact">With contact info</option>
              <option value="missing-contact">Missing contact info</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
            >
              <option value="updated_desc">Recently updated</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message={t('common.loading')} />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-slate-500">{t('pharmacies.empty')}</p>
        ) : (
          <ul className="divide-y divide-violet-100">
            {rows.map((p) => {
              const isEditing = editingId === p.id
              return (
                <li key={p.id} className="px-6 py-3 bg-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder={t('pharmacies.edit_name_placeholder')}
                            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                          />
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: phoneDigitsOnly(e.target.value) }))}
                            placeholder={t('pharmacies.phone_placeholder')}
                            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                          />
                          <input
                            value={editForm.address}
                            onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                            placeholder={t('pharmacies.address')}
                            className="md:col-span-2 bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                          />
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder={t('pharmacies.email')}
                            className="md:col-span-2 bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-slate-900 font-semibold truncate">
                            {p.name || t('pharmacies.pharmacy_fallback', { id: p.id })}
                          </span>
                          <span className="text-xs text-slate-500 shrink-0">
                            {t('pharmacies.id_label')} {p.id}
                          </span>
                          {(p.linked_encounter_count ?? 0) > 0 && (
                            <span
                              className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0"
                              title={t('pharmacies.linked_encounters', { count: p.linked_encounter_count ?? 0 })}
                            >
                              {t('pharmacies.linked_encounters_short', { count: p.linked_encounter_count ?? 0 })}
                            </span>
                          )}
                          <span className="text-sm text-slate-500 truncate">
                            {p.address || '—'}
                            {(p.phone || p.email) ? ' · ' : ''}
                            {p.phone}
                            {p.phone && p.email ? ' · ' : ''}
                            {p.email}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => submitEdit(p.id)}
                            disabled={editSaving || !editForm.name.trim()}
                            className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm disabled:opacity-50"
                          >
                            {editSaving ? t('common.saving') : t('common.save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
                          >
                            {t('common.cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
                          >
                            {t('pharmacies.edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm hover:bg-red-100"
                          >
                            {t('pharmacies.delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => {
          if (!deleteSubmitting) setDeleteTarget(null)
        }}
        onConfirm={confirmDeletePharmacy}
        title={t('pharmacies.delete_confirm_title')}
        message={
          deleteTarget
            ? (deleteTarget.linked_encounter_count ?? 0) > 0
              ? t('pharmacies.confirm_delete_pharmacy_with_links', {
                  count: deleteTarget.linked_encounter_count ?? 0,
                })
              : t('pharmacies.confirm_delete_pharmacy_none')
            : ''
        }
        confirmLabel={t('pharmacies.delete')}
        variant="danger"
        accent="violet"
        loading={deleteSubmitting}
      />

      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-3 py-1.5 text-slate-600">Page {page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(PharmaciesPage, {
  allowedRoles: [UserRole.ADMIN],
  redirectTo: '/admin',
})
