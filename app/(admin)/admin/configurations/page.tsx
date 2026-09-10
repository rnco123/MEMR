'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { useT } from '@/lib/i18n'
import { UserRole } from '@/lib/roles'
import type { TenantRow } from '@/lib/tenants/types'
import { toast } from 'sonner'
import {
  countLocationAssignments,
  fetchServiceAvailability,
  getLocationRules,
  sameConfig,
  sameRules,
  saveLocationRules,
  setLocationServices,
  setLocationSurface,
  setServiceAssigned,
  type ServiceAvailabilityConfig,
} from '@/lib/configurations/service-availability'
import {
  BRAND_COLOR_PRESETS,
  getTenantBrandColor,
  getTenantColor,
  loadTenantColors,
  normalizeHexColor,
  saveTenantColors,
  setTenantColor,
  tenantBadgeStyle,
  unsetTenantColor,
  type TenantColorMap,
} from '@/lib/configurations/tenant-colors'

type LocationRow = {
  id: number
  title: string
  location_code: string | null
  tenant_id: number | null
  tenant_name: string | null
  tenant_code: string | null
  is_active: boolean
}

type ServiceRow = {
  id: number
  title_en: string
  title_es?: string | null
}

const LOCATIONS_PAGE_SIZE = 100

type ConfigTab = 'services' | 'tenants'

function AdminConfigurationsPage() {
  const { t, language } = useT()

  const [locations, setLocations] = useState<LocationRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)

  const [savedConfig, setSavedConfig] = useState<ServiceAvailabilityConfig>({})
  const [draftConfig, setDraftConfig] = useState<ServiceAvailabilityConfig>({})
  const [savedColors, setSavedColors] = useState<TenantColorMap>({})
  const [draftColors, setDraftColors] = useState<TenantColorMap>({})
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<ConfigTab>('services')
  // What the admin is currently typing in each hex field. A controlled input bound
  // straight to the committed color would discard partial values like "#7c3".
  const [hexDrafts, setHexDrafts] = useState<Record<string, string>>({})

  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [tenantFilter, setTenantFilter] = useState<number | 'all'>('all')
  const [serviceQuery, setServiceQuery] = useState('')
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'assigned' | 'unassigned'>('all')

  const serviceTitle = useCallback(
    (service: ServiceRow) =>
      (language === 'es' && service.title_es ? service.title_es : service.title_en) || '',
    [language]
  )

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [locationRows, serviceRows, tenantRows] = await Promise.all([
        (async () => {
          const rows: LocationRow[] = []
          let page = 1
          while (true) {
            const params = new URLSearchParams({
              page: String(page),
              pageSize: String(LOCATIONS_PAGE_SIZE),
              status: 'all',
              sort: 'title_asc',
            })
            const res = await fetch(`/api/admin/locations?${params}`, { credentials: 'include' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || t('admin.config.toast_load_failed'))
            const batch = (json.data ?? []) as LocationRow[]
            rows.push(...batch)
            if (batch.length < LOCATIONS_PAGE_SIZE) break
            page += 1
          }
          return rows
        })(),
        (async () => {
          const res = await fetch('/api/services', { credentials: 'include' })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error || t('admin.config.toast_load_failed'))
          return (json.services ?? []) as ServiceRow[]
        })(),
        (async () => {
          try {
            const res = await fetch('/api/admin/tenants', { credentials: 'include' })
            const json = await res.json()
            if (!res.ok) return [] as TenantRow[]
            return (json.data ?? []) as TenantRow[]
          } catch {
            return [] as TenantRow[]
          }
        })(),
      ])

      setLocations(locationRows)
      setServices(serviceRows)
      setTenants(tenantRows)
      setSelectedLocationId((current) =>
        current != null && locationRows.some((row) => row.id === current)
          ? current
          : (locationRows[0]?.id ?? null)
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.config.toast_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    void (async () => {
      try {
        const stored = await fetchServiceAvailability()
        setSavedConfig(stored)
        setDraftConfig(stored)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('admin.config.toast_load_failed'))
      }
    })()

    const storedColors = loadTenantColors()
    setSavedColors(storedColors)
    setDraftColors(storedColors)
  }, [t])

  const servicesDirty = useMemo(
    () => !sameConfig(savedConfig, draftConfig),
    [savedConfig, draftConfig]
  )

  const colorsDirty = useMemo(() => {
    const savedKeys = Object.keys(savedColors)
    const draftKeys = Object.keys(draftColors)
    if (savedKeys.length !== draftKeys.length) return true
    return savedKeys.some((key) => savedColors[key] !== draftColors[key])
  }, [savedColors, draftColors])

  const isDirty = servicesDirty || colorsDirty

  const filteredLocations = useMemo(() => {
    const term = locationQuery.trim().toLowerCase()
    return locations.filter((row) => {
      if (tenantFilter !== 'all' && row.tenant_id !== tenantFilter) return false
      if (!term) return true
      return (
        row.title.toLowerCase().includes(term) ||
        (row.location_code ?? '').toLowerCase().includes(term) ||
        (row.tenant_name ?? '').toLowerCase().includes(term)
      )
    })
  }, [locations, locationQuery, tenantFilter])

  const selectedLocation = useMemo(
    () => locations.find((row) => row.id === selectedLocationId) ?? null,
    [locations, selectedLocationId]
  )

  const selectedRules = useMemo(
    () => getLocationRules(draftConfig, selectedLocationId ?? 0),
    [draftConfig, selectedLocationId]
  )

  const assignedIds = useMemo(() => new Set(selectedRules.service_ids), [selectedRules])

  const filteredServices = useMemo(() => {
    const term = serviceQuery.trim().toLowerCase()
    return services.filter((service) => {
      const assigned = assignedIds.has(service.id)
      if (assignedFilter === 'assigned' && !assigned) return false
      if (assignedFilter === 'unassigned' && assigned) return false
      if (!term) return true
      return (
        (service.title_en ?? '').toLowerCase().includes(term) ||
        (service.title_es ?? '').toLowerCase().includes(term)
      )
    })
  }, [services, serviceQuery, assignedFilter, assignedIds])

  const assignedCount = selectedRules.service_ids.length

  const configuredLocationCount = useMemo(
    () => locations.filter((row) => countLocationAssignments(draftConfig, row.id) > 0).length,
    [locations, draftConfig]
  )

  const toggleService = (serviceId: number, checked: boolean) => {
    if (selectedLocationId == null) return
    setDraftConfig((current) =>
      setServiceAssigned(current, selectedLocationId, serviceId, checked)
    )
  }

  const toggleSurface = (surface: 'portal' | 'emr', enabled: boolean) => {
    if (selectedLocationId == null) return
    setDraftConfig((current) => setLocationSurface(current, selectedLocationId, surface, enabled))
  }

  /** Assign or unassign every service currently listed, leaving the rest alone. */
  const applyToFiltered = (assign: boolean) => {
    if (selectedLocationId == null) return
    setDraftConfig((current) => {
      const listed = filteredServices.map((service) => service.id)
      const existing = getLocationRules(current, selectedLocationId).service_ids
      const next = assign
        ? [...existing, ...listed]
        : existing.filter((id) => !listed.includes(id))
      return setLocationServices(current, selectedLocationId, next)
    })
  }

  const changeTenantColor = (tenantId: number, color: string) => {
    setDraftColors((current) => setTenantColor(current, tenantId, color))
    setHexDrafts((current) => {
      if (current[String(tenantId)] == null) return current
      const next = { ...current }
      delete next[String(tenantId)]
      return next
    })
  }

  /** Commit only once the typed text is a valid color; keep showing it either way. */
  const typeTenantHex = (tenantId: number, text: string) => {
    setHexDrafts((current) => ({ ...current, [String(tenantId)]: text }))
    const hex = normalizeHexColor(text)
    if (hex) setDraftColors((current) => setTenantColor(current, tenantId, hex))
  }

  /** Drop the buffer on blur so an incomplete value snaps back to the real color. */
  const commitTenantHex = (tenantId: number) => {
    setHexDrafts((current) => {
      const next = { ...current }
      delete next[String(tenantId)]
      return next
    })
  }

  /** Back to the theme default (the tenant stops carrying its own color). */
  const resetTenantColor = (tenantId: number) => {
    setDraftColors((current) => unsetTenantColor(current, tenantId))
    commitTenantHex(tenantId)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Only the locations the admin actually touched are written, so an unrelated
      // location cannot be overwritten by a stale draft.
      const changed = Object.keys(draftConfig).filter(
        (key) => savedConfig[key] == null || !sameRules(savedConfig[key]!, draftConfig[key]!)
      )

      const saved: ServiceAvailabilityConfig = { ...savedConfig }
      let failed = 0

      for (const key of changed) {
        try {
          saved[key] = await saveLocationRules(Number(key), draftConfig[key]!)
        } catch {
          failed += 1
        }
      }

      // Tenant colours are still a browser-local preference; they have no table yet.
      const colorsOk = !colorsDirty || saveTenantColors(draftColors)

      setSavedConfig(saved)
      if (colorsOk) setSavedColors(draftColors)

      if (failed > 0 || !colorsOk) {
        toast.error(t('admin.config.toast_save_failed'))
        return
      }
      toast.success(t('admin.config.toast_saved'))
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    setDraftConfig(savedConfig)
    setDraftColors(savedColors)
    toast.success(t('admin.config.toast_discarded'))
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.config.title')}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {isDirty && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {t('admin.config.unsaved')}
              </span>
            )}
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!isDirty || saving}
              className="px-4 py-2 rounded-xl border border-purple-200 bg-white text-purple-700 text-sm font-medium hover:bg-purple-50 transition-colors disabled:opacity-50"
            >
              {t('admin.config.discard')}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!isDirty || saving}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('admin.config.save')}
            </button>
          </div>
        </div>
        <p className="text-slate-600 text-sm max-w-3xl">{t('admin.config.subtitle')}</p>
      </div>

      <div className="mb-6 border-b border-purple-100">
        <nav className="-mb-px flex flex-wrap gap-6" aria-label={t('admin.config.title')}>
          {([
            { key: 'services', label: t('admin.config.tab_services'), dirty: servicesDirty },
            { key: 'tenants', label: t('admin.config.tab_tenant_colors'), dirty: colorsDirty },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={activeTab === tab.key ? 'page' : undefined}
              className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-500 hover:border-purple-200 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="bg-white border border-purple-100 rounded-2xl shadow-sm p-12 flex justify-center">
          <LoadingSpinner message={t('common.loading')} />
        </div>
      ) : activeTab === 'services' ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 items-start">
          {/* Locations */}
          <div className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden xl:col-span-1">
            <div className="px-5 py-4 border-b border-purple-100 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t('admin.config.locations_title')}
                </h2>
                <span className="text-xs text-slate-500">
                  {t('admin.config.configured_count', {
                    count: configuredLocationCount,
                    total: locations.length,
                  })}
                </span>
              </div>
              <input
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                placeholder={t('admin.config.location_search_placeholder')}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
              <select
                value={tenantFilter === 'all' ? 'all' : String(tenantFilter)}
                onChange={(e) => {
                  const value = e.target.value
                  setTenantFilter(value === 'all' ? 'all' : Number(value))
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">{t('locations.filter_all_tenants')}</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.tenant_code})
                  </option>
                ))}
              </select>
            </div>

            {filteredLocations.length === 0 ? (
              <p className="p-8 text-slate-500 text-sm">{t('admin.config.locations_empty')}</p>
            ) : (
              <ul className="divide-y divide-purple-100 max-h-[32rem] overflow-y-auto">
                {filteredLocations.map((row) => {
                  const count = countLocationAssignments(draftConfig, row.id)
                  const isSelected = row.id === selectedLocationId
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedLocationId(row.id)}
                        className={`w-full text-left px-5 py-3 transition-colors ${
                          isSelected ? 'bg-purple-50' : 'bg-white hover:bg-purple-50/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={`flex items-center gap-2 text-sm font-semibold truncate ${
                                isSelected ? 'text-purple-700' : 'text-slate-900'
                              }`}
                            >
                              {/* Draft colors, so the Tenant colors tab previews live. */}
                              <span
                                aria-hidden
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: getTenantColor(draftColors, row.tenant_id),
                                }}
                              />
                              <span className="truncate">{row.title}</span>
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {row.tenant_name
                                ? `${row.tenant_name}${row.location_code ? ` · ${row.location_code}` : ''}`
                                : (row.location_code ?? t('locations.no_tenant'))}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                count > 0
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {t('admin.config.services_count', { count })}
                            </span>
                            {!row.is_active && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                                {t('locations.disabled_badge')}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Services for the selected location */}
          <div className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden xl:col-span-2">
            {selectedLocation == null ? (
              <p className="p-8 text-slate-500 text-sm">{t('admin.config.select_location')}</p>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-purple-100 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-slate-900">
                        {selectedLocation.title}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {t('admin.config.assigned_summary', {
                          count: assignedCount,
                          total: services.length,
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSurface('portal', !selectedRules.portal_enabled)}
                        className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                          selectedRules.portal_enabled
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}
                        aria-pressed={selectedRules.portal_enabled}
                      >
                        {t('admin.config.channel_portal')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSurface('emr', !selectedRules.emr_enabled)}
                        className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                          selectedRules.emr_enabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}
                        aria-pressed={selectedRules.emr_enabled}
                      >
                        {t('admin.config.channel_emr')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      value={serviceQuery}
                      onChange={(e) => setServiceQuery(e.target.value)}
                      placeholder={t('admin.config.service_search_placeholder')}
                      className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
                    />
                    <select
                      value={assignedFilter}
                      onChange={(e) => setAssignedFilter(e.target.value as typeof assignedFilter)}
                      className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="all">{t('admin.config.filter_all')}</option>
                      <option value="assigned">{t('admin.config.filter_assigned')}</option>
                      <option value="unassigned">{t('admin.config.filter_unassigned')}</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => applyToFiltered(true)}
                      disabled={filteredServices.length === 0}
                      className="px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-purple-700 text-xs font-medium hover:bg-purple-50 transition-colors disabled:opacity-50"
                    >
                      {t('admin.config.apply_all')}
                    </button>
                    <button
                      type="button"
                      onClick={() => applyToFiltered(false)}
                      disabled={filteredServices.length === 0}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {t('admin.config.clear_all')}
                    </button>
                  </div>
                </div>

                {filteredServices.length === 0 ? (
                  <p className="p-8 text-slate-500 text-sm">{t('admin.config.services_empty')}</p>
                ) : (
                  <ul className="divide-y divide-purple-100 max-h-[32rem] overflow-y-auto">
                    {filteredServices.map((service) => {
                      const assigned = assignedIds.has(service.id)
                      return (
                        <li
                          key={service.id}
                          className={`px-6 py-4 ${assigned ? 'bg-white' : 'bg-slate-50/60'}`}
                        >
                          <label className="flex items-start gap-3 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={assigned}
                              onChange={(e) => toggleService(service.id, e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-slate-900">
                                {serviceTitle(service)}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {t('admin.config.service_id', { id: service.id })}
                              </span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-purple-100">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('admin.config.tenant_colors_title')}
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl">
              {t('admin.config.tenant_colors_subtitle')}
            </p>
          </div>

          {tenants.length === 0 ? (
            <p className="p-8 text-slate-500 text-sm">{t('admin.config.tenants_empty')}</p>
          ) : (
            <ul className="divide-y divide-purple-100">
              {tenants.map((tenant) => {
                const color = getTenantColor(draftColors, tenant.id)
                const isCustom = draftColors[String(tenant.id)] != null
                const badge = tenantBadgeStyle(color)
                const inputId = `tenant-color-${tenant.id}`

                return (
                  <li key={tenant.id} className="px-6 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {tenant.name}
                          </span>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full border"
                            style={badge}
                          >
                            {tenant.tenant_code}
                          </span>
                          {!isCustom && (
                            <span className="text-xs text-slate-400">
                              {t('admin.config.color_brand_default')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {t('admin.config.color_preview_hint')}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 pr-1">
                          {BRAND_COLOR_PRESETS.map((preset) => (
                            <button
                              key={preset.color}
                              type="button"
                              onClick={() => changeTenantColor(tenant.id, preset.color)}
                              title={`${preset.name} · ${preset.color}`}
                              aria-label={preset.name}
                              aria-pressed={color === preset.color}
                              className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                                color === preset.color
                                  ? 'border-slate-900 ring-2 ring-offset-1 ring-slate-300'
                                  : 'border-slate-300'
                              }`}
                              style={{ backgroundColor: preset.color }}
                            />
                          ))}
                        </div>
                        <label htmlFor={inputId} className="sr-only">
                          {t('admin.config.color_pick', { tenant: tenant.name })}
                        </label>
                        <input
                          id={inputId}
                          type="color"
                          value={color}
                          onChange={(e) => changeTenantColor(tenant.id, e.target.value)}
                          title={t('admin.config.color_pick', { tenant: tenant.name })}
                          className="h-9 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                        />
                        <input
                          type="text"
                          value={hexDrafts[String(tenant.id)] ?? color}
                          onChange={(e) => typeTenantHex(tenant.id, e.target.value)}
                          onBlur={() => commitTenantHex(tenant.id)}
                          spellCheck={false}
                          aria-label={t('admin.config.color_hex')}
                          placeholder={getTenantBrandColor(tenant.id)}
                          className="w-28 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 uppercase"
                        />
                        <button
                          type="button"
                          onClick={() => resetTenantColor(tenant.id)}
                          disabled={!isCustom}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          {t('admin.config.color_reset')}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(AdminConfigurationsPage, {
  allowedRoles: [UserRole.ADMIN],
  redirectTo: '/dashboard',
})
