'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { LocationHoursEditor } from '@/components/LocationHoursEditor'
import { AddressLookupInput } from '@/components/AddressLookupInput'
import { resolveGoogleMapUrl } from '@/lib/locations/format'
import {
  DEFAULT_WEEKLY_HOURS,
  formatOpeningHoursDisplay,
  isStructuredOpeningHours,
  serializeOpeningHours,
} from '@/lib/locations/hours'
import { suggestNextTenantCode } from '@/lib/locations/suggest-codes'
import { useT } from '@/lib/i18n'
import { UserRole } from '@/lib/roles'
import type { TenantRow } from '@/lib/tenants/types'
import { toast } from 'sonner'

type LocationRow = {
  id: number
  title: string
  location_code: string | null
  location_group: string | null
  address: string | null
  phone: string | null
  email: string | null
  opening_hours: string | null
  google_map_url: string | null
  is_active: boolean
  tenant_id: number | null
  tenant_name: string | null
  tenant_code: string | null
  created_at: string
  updated_at: string | null
}

type LocationForm = {
  title: string
  tenant_id: number | null
  location_group: string
  address: string
  phone: string
  email: string
  opening_hours: string
  google_map_url: string
}

const blankForm = (tenantId: number | null = null): LocationForm => ({
  title: '',
  tenant_id: tenantId,
  location_group: '',
  address: '',
  phone: '',
  email: '',
  opening_hours: serializeOpeningHours(DEFAULT_WEEKLY_HOURS) ?? '',
  google_map_url: '',
})

type LocationFieldAuto = {
  map: boolean
}

function MapLinkHint({
  mapInput,
  address,
}: {
  mapInput: string
  address: string
}) {
  const { t } = useT()
  const preview = useMemo(
    () => resolveGoogleMapUrl(mapInput, address),
    [address, mapInput]
  )

  if (!mapInput.trim() && !address.trim()) return null

  if (!preview.valid) {
    return <p className="mt-1 text-xs text-red-600">{t('locations.map_invalid')}</p>
  }

  if (!preview.url) return null

  return (
    <p className="mt-1 text-xs text-slate-500">
      {preview.derivedFrom === 'address'
        ? t('locations.map_from_address')
        : preview.derivedFrom === 'coordinates'
          ? t('locations.map_from_coordinates')
          : t('locations.map_verified')}
      {' · '}
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-purple-600 hover:underline break-all"
      >
        {t('locations.open_map')}
      </a>
    </p>
  )
}

function AdminLocationsPage() {
  const { t } = useT()
  const [rows, setRows] = useState<LocationRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [defaultTenantId, setDefaultTenantId] = useState(1)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showTenantForm, setShowTenantForm] = useState(false)
  const [tenantForm, setTenantForm] = useState({ name: '', tenant_code: '' })
  const [tenantSubmitting, setTenantSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState(blankForm())
  const [createFieldAuto, setCreateFieldAuto] = useState<LocationFieldAuto>({
    map: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(blankForm())
  const [editFieldAuto, setEditFieldAuto] = useState<LocationFieldAuto>({
    map: false,
  })
  const [editSaving, setEditSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [tenantFilter, setTenantFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<'title_asc' | 'title_desc' | 'updated_desc'>('title_asc')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tenants', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load tenants')
      const rows = (json.data ?? []) as TenantRow[]
      setTenants(rows)
      if (rows.length > 0) {
        setDefaultTenantId(rows[0]!.id)
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const loadLocations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search: debouncedSearch.trim(),
        status: statusFilter,
        sort: sortBy,
      })
      if (tenantFilter !== 'all') {
        params.set('tenant_id', String(tenantFilter))
      }
      const res = await fetch(`/api/admin/locations?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('locations.toast_load_failed'))
      setRows(json.data ?? [])
      setTotalCount(json.total ?? 0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('locations.toast_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, page, pageSize, sortBy, statusFilter, tenantFilter, t])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

  useEffect(() => {
    void loadLocations()
  }, [loadLocations])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, tenantFilter, sortBy])

  const openTenantForm = () => {
    setShowTenantForm((current) => {
      const next = !current
      if (next) {
        setTenantForm({ name: '', tenant_code: suggestNextTenantCode(tenants) })
      }
      return next
    })
  }

  const applyTenantToForms = (tenantId: number) => {
    setCreateForm((current) => ({ ...current, tenant_id: tenantId }))
    setEditForm((current) => ({ ...current, tenant_id: tenantId }))
  }

  const submitTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setTenantSubmitting(true)
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tenantForm.name.trim(),
          tenant_code: tenantForm.tenant_code.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        const message = json.error || t('locations.toast_tenant_create_failed')
        if (typeof message === 'string' && message.toLowerCase().includes('tenant code')) {
          throw new Error(t('locations.toast_tenant_code_exists'))
        }
        throw new Error(message)
      }
      const created = json.data as TenantRow
      toast.success(t('locations.toast_tenant_created'))
      setTenantForm({ name: '', tenant_code: '' })
      setShowTenantForm(false)
      await loadTenants()
      applyTenantToForms(created.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('locations.toast_tenant_create_failed'))
    } finally {
      setTenantSubmitting(false)
    }
  }

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const mapPreview = resolveGoogleMapUrl(createForm.google_map_url, createForm.address)
    if (!mapPreview.valid) {
      toast.error(t('locations.map_invalid'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/locations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          tenant_id: createForm.tenant_id ?? null,
          location_group: createForm.location_group.trim() || null,
          address: createForm.address.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
          opening_hours: createForm.opening_hours.trim() || null,
          google_map_url: createForm.google_map_url.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('locations.toast_create_failed'))
      toast.success(t('locations.toast_created'))
      setCreateForm(blankForm(defaultTenantId))
      setCreateFieldAuto({ map: true })
      setShowCreateForm(false)
      await loadLocations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('locations.toast_create_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (row: LocationRow) => {
    setEditingId(row.id)
    setEditFieldAuto({ map: false })
    setEditForm({
      title: row.title,
      tenant_id: row.tenant_id,
      location_group: row.location_group ?? '',
      address: row.address ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      opening_hours: row.opening_hours ?? '',
      google_map_url: row.google_map_url ?? '',
    })
  }

  const submitEdit = async (id: number) => {
    const mapPreview = resolveGoogleMapUrl(editForm.google_map_url, editForm.address)
    if (!mapPreview.valid) {
      toast.error(t('locations.map_invalid'))
      return
    }

    setEditSaving(true)
    try {
      const res = await fetch(`/api/admin/locations/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          tenant_id: editForm.tenant_id ?? null,
          location_group: editForm.location_group.trim() || null,
          address: editForm.address.trim() || null,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          opening_hours: editForm.opening_hours.trim() || null,
          google_map_url: editForm.google_map_url.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('locations.toast_update_failed'))
      toast.success(t('locations.toast_updated'))
      setEditingId(null)
      await loadLocations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('locations.toast_update_failed'))
    } finally {
      setEditSaving(false)
    }
  }

  const toggleActive = async (row: LocationRow) => {
    const nextActive = !row.is_active
    const confirmKey = nextActive ? 'locations.confirm_enable' : 'locations.confirm_disable'
    if (!window.confirm(t(confirmKey, { name: row.title }))) return

    try {
      const res = await fetch(`/api/admin/locations/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('locations.toast_update_failed'))
      toast.success(nextActive ? t('locations.toast_enabled') : t('locations.toast_disabled'))
      if (editingId === row.id) setEditingId(null)
      await loadLocations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('locations.toast_update_failed'))
    }
  }

  const renderFormFields = (
    form: LocationForm,
    setForm: React.Dispatch<React.SetStateAction<LocationForm>>,
    fieldAuto: LocationFieldAuto,
    setFieldAuto: React.Dispatch<React.SetStateAction<LocationFieldAuto>>,
    readOnlyLocationCode?: string | null
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="text-sm text-slate-700">{t('locations.tenant')}</label>
        <select
          value={form.tenant_id ?? ''}
          onChange={(e) => {
            const value = e.target.value
            setForm((f) => ({
              ...f,
              tenant_id: value === '' ? null : Number(value),
            }))
          }}
          className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
        >
          <option value="">{t('locations.no_tenant')}</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name} ({tenant.tenant_code})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setTenantForm({ name: '', tenant_code: suggestNextTenantCode(tenants) })
            setShowTenantForm(true)
          }}
          className="mt-1 text-xs font-medium text-purple-600 hover:text-purple-800 hover:underline"
        >
          {t('locations.tenant_new_link')}
        </button>
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-700">{t('locations.title_req')}</label>
        <input
          required
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
          placeholder={t('locations.title_placeholder')}
        />
      </div>
      <div>
        <label className="text-sm text-slate-700">{t('locations.code')}</label>
        {readOnlyLocationCode ? (
          <p className="mt-1 text-sm font-medium text-slate-700">{readOnlyLocationCode}</p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">{t('locations.code_auto_generated')}</p>
        )}
      </div>
      <div>
        <label className="text-sm text-slate-700">{t('locations.group')}</label>
        <input
          value={form.location_group}
          onChange={(e) => setForm((f) => ({ ...f, location_group: e.target.value }))}
          className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
          placeholder={t('locations.group_placeholder')}
        />
      </div>
      <div>
        <label className="text-sm text-slate-700">{t('locations.phone')}</label>
        <input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
          placeholder={t('locations.phone_placeholder')}
        />
      </div>
      <div>
        <label className="text-sm text-slate-700">{t('locations.email')}</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
          placeholder={t('locations.email_placeholder')}
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-700">{t('locations.hours')}</label>
        {form.opening_hours.trim() && !isStructuredOpeningHours(form.opening_hours) ? (
          <p className="mt-1 text-xs text-amber-700">{t('locations.hours_legacy_note', { text: form.opening_hours })}</p>
        ) : null}
        <LocationHoursEditor
          value={form.opening_hours}
          onChange={(opening_hours) => setForm((f) => ({ ...f, opening_hours }))}
        />
      </div>
      <div className="md:col-span-2">
        <AddressLookupInput
          label={t('locations.address')}
          value={form.address}
          onChange={(address) => {
            setForm((f) => {
              const next = { ...f, address }
              if (fieldAuto.map) {
                const mapPreview = resolveGoogleMapUrl('', address)
                next.google_map_url = mapPreview.url ?? ''
              }
              return next
            })
          }}
          placeholder={t('locations.address_placeholder')}
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-700">{t('locations.map_link')}</label>
        <input
          value={form.google_map_url}
          onChange={(e) => {
            setFieldAuto((current) => ({ ...current, map: false }))
            setForm((f) => ({ ...f, google_map_url: e.target.value }))
          }}
          className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
          placeholder={t('locations.map_placeholder')}
        />
        {fieldAuto.map ? (
          <p className="mt-1 text-xs text-slate-400">{t('locations.auto_in_box')}</p>
        ) : null}
        <MapLinkHint mapInput={form.google_map_url} address={form.address} />
        <p className="mt-1 text-xs text-slate-400">{t('locations.map_hint')}</p>
      </div>
    </div>
  )

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <h1 className="text-3xl font-bold text-slate-900">{t('locations.title')}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateForm((open) => {
                  if (!open) {
                    setCreateForm(blankForm(defaultTenantId))
                    setCreateFieldAuto({ map: true })
                  }
                  return !open
                })
              }}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              {showCreateForm ? t('common.cancel') : t('locations.add_title')}
            </button>
            <button
              type="button"
              onClick={openTenantForm}
              className="px-4 py-2 rounded-xl border border-purple-200 bg-white text-purple-700 text-sm font-medium hover:bg-purple-50 transition-colors"
            >
              {showTenantForm ? t('common.cancel') : t('locations.add_tenant')}
            </button>
          </div>
        </div>
        <p className="text-slate-600 text-sm max-w-3xl">{t('locations.subtitle')}</p>
      </div>

      {showTenantForm && (
        <form
          onSubmit={submitTenant}
          className="bg-white border border-purple-100 shadow-sm rounded-2xl p-6 mb-8 space-y-4"
        >
          <h2 className="text-lg font-semibold text-slate-900">{t('locations.add_tenant')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-700">{t('locations.tenant_name')}</label>
              <input
                required
                value={tenantForm.name}
                onChange={(e) => setTenantForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                placeholder={t('locations.tenant_name_placeholder')}
              />
            </div>
            <div>
              <label className="text-sm text-slate-700">{t('locations.tenant_code')}</label>
              <input
                required
                value={tenantForm.tenant_code}
                onChange={(e) => setTenantForm((f) => ({ ...f, tenant_code: e.target.value }))}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                placeholder={t('locations.tenant_code_placeholder')}
                pattern="[A-Za-z0-9_-]+"
              />
              <p className="mt-1 text-xs text-slate-400">{t('locations.auto_in_box')}</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={
              tenantSubmitting ||
              !tenantForm.name.trim() ||
              !tenantForm.tenant_code.trim()
            }
            className="px-6 py-3 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {tenantSubmitting ? t('common.saving') : t('locations.save_tenant')}
          </button>
        </form>
      )}

      {showCreateForm && (
        <form
          onSubmit={submitCreate}
          className="bg-white border border-purple-100 shadow-sm rounded-2xl p-6 mb-8 space-y-4"
        >
          <h2 className="text-lg font-semibold text-slate-900">{t('locations.add_title')}</h2>
          {renderFormFields(createForm, setCreateForm, createFieldAuto, setCreateFieldAuto)}
          <button
            type="submit"
            disabled={submitting || !createForm.title.trim()}
            className="px-6 py-3 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? t('common.saving') : t('locations.save')}
          </button>
        </form>
      )}

      <div className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-purple-100">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{t('locations.list_title')}</h2>
            <span className="text-xs text-slate-500">
              {t('locations.total_count', { count: totalCount.toLocaleString() })}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('locations.search_placeholder')}
              className="xl:col-span-2 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
            />
            <select
              value={tenantFilter === 'all' ? 'all' : String(tenantFilter)}
              onChange={(e) => {
                const value = e.target.value
                setTenantFilter(value === 'all' ? 'all' : Number(value))
              }}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">{t('locations.filter_all_tenants')}</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.tenant_code})
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">{t('locations.filter_all')}</option>
              <option value="active">{t('locations.filter_active')}</option>
              <option value="inactive">{t('locations.filter_inactive')}</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
            >
              <option value="title_asc">{t('locations.sort_name_asc')}</option>
              <option value="title_desc">{t('locations.sort_name_desc')}</option>
              <option value="updated_desc">{t('locations.sort_updated_desc')}</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message={t('common.loading')} />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-slate-500">{t('locations.empty')}</p>
        ) : (
          <ul className="divide-y divide-purple-100">
            {rows.map((row) => {
              const isEditing = editingId === row.id
              return (
                <li
                  key={row.id}
                  className={`px-6 py-4 ${!row.is_active ? 'bg-slate-50/80' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        renderFormFields(
                          editForm,
                          setEditForm,
                          editFieldAuto,
                          setEditFieldAuto,
                          row.location_code
                        )
                      ) : (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-900 font-semibold">{row.title}</span>
                            <span className="text-xs text-slate-500">
                              {t('locations.id_label', { id: row.id })}
                            </span>
                            {row.tenant_id != null && row.tenant_name && row.tenant_code ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                                {t('locations.tenant_badge', {
                                  name: row.tenant_name,
                                  code: row.tenant_code,
                                })}
                              </span>
                            ) : (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                {t('locations.no_tenant')}
                              </span>
                            )}
                            {!row.is_active && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                                {t('locations.disabled_badge')}
                              </span>
                            )}
                            {row.location_group ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                {t('locations.group_badge', { group: row.location_group })}
                              </span>
                            ) : null}
                          </div>
                          {row.location_code ? (
                            <p className="text-xs text-slate-400">{row.location_code}</p>
                          ) : null}
                          {row.opening_hours ? (
                            <p className="text-sm text-slate-600">
                              {formatOpeningHoursDisplay(row.opening_hours, {
                                days: {
                                  mon: t('locations.hours_day_mon'),
                                  tue: t('locations.hours_day_tue'),
                                  wed: t('locations.hours_day_wed'),
                                  thu: t('locations.hours_day_thu'),
                                  fri: t('locations.hours_day_fri'),
                                  sat: t('locations.hours_day_sat'),
                                  sun: t('locations.hours_day_sun'),
                                },
                                closed: t('locations.hours_closed'),
                              }) ?? row.opening_hours}
                            </p>
                          ) : null}
                          {row.address ? (
                            <p className="text-sm text-slate-500">{row.address}</p>
                          ) : null}
                          {(row.phone || row.email || row.google_map_url) && (
                            <p className="text-sm text-slate-500">
                              {row.phone}
                              {row.phone && row.email ? ' · ' : ''}
                              {row.email ? (
                                <a
                                  href={`mailto:${row.email}`}
                                  className="text-purple-600 hover:underline"
                                >
                                  {row.email}
                                </a>
                              ) : null}
                              {(row.phone || row.email) && row.google_map_url ? ' · ' : ''}
                              {row.google_map_url ? (
                                <a
                                  href={row.google_map_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-600 hover:underline"
                                >
                                  {t('locations.open_map')}
                                </a>
                              ) : null}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => submitEdit(row.id)}
                            disabled={editSaving || !editForm.title.trim()}
                            className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm disabled:opacity-50"
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
                            onClick={() => startEdit(row)}
                            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
                          >
                            {t('locations.edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleActive(row)}
                            className={`px-3 py-2 rounded-lg text-sm ${
                              row.is_active
                                ? 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
                                : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                            }`}
                          >
                            {row.is_active ? t('locations.disable') : t('locations.enable')}
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

      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500">
            {t('locations.showing_range', {
              from: (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, totalCount),
              total: totalCount.toLocaleString(),
            })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              {t('common.previous')}
            </button>
            <span className="px-3 py-1.5 text-slate-600">
              {t('common.page_x_of_y', { page, total: totalPages })}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(AdminLocationsPage, {
  allowedRoles: [UserRole.ADMIN],
  redirectTo: '/dashboard',
})
