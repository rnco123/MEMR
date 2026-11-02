'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LocationQrDialog } from '@/components/LocationQrDialog'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { useT } from '@/lib/i18n'
import { UserRole } from '@/lib/roles'

type QrRow = {
  id: number
  title: string
  is_active: boolean
  tenant_id: number | null
  tenant_name: string | null
  portal_location_id: number | null
  qr_image_url: string | null
  intake_url: string | null
  qr_created_at: string | null
}

type Status = 'ready' | 'missing' | 'unlinked'

const statusOf = (r: QrRow): Status =>
  r.qr_image_url ? 'ready' : r.portal_location_id == null ? 'unlinked' : 'missing'

const STATUS_STYLE: Record<Status, string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  missing: 'bg-amber-50 text-amber-800 border-amber-200',
  unlinked: 'bg-slate-100 text-slate-600 border-slate-200',
}

const SELECT =
  'h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
const BTN = 'h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors disabled:opacity-40'

/**
 * Patient check-in QR codes for every location. Generating goes through mcm-bridge,
 * which adds the location to the portal when it is not there yet, makes the PNG and
 * writes the portal `Qr` row (link included). Existing codes are never replaced, so
 * printed ones keep working.
 */
function AdminQrPage() {
  const { t } = useT()
  const [rows, setRows] = useState<QrRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tenantFilter, setTenantFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
  const [dialogFor, setDialogFor] = useState<QrRow | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/qr', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('admin.qr.load_failed'))
      setRows(json.rows ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.qr.load_failed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const tenants = useMemo(() => {
    const map = new Map<number, string>()
    for (const r of rows) if (r.tenant_id != null) map.set(r.tenant_id, r.tenant_name ?? `#${r.tenant_id}`)
    return [...map].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => showInactive || r.is_active)
      .filter((r) => tenantFilter === 'all' || String(r.tenant_id) === tenantFilter)
      .filter((r) => statusFilter === 'all' || statusOf(r) === statusFilter)
      .filter(
        (r) => !q || r.title.toLowerCase().includes(q) || (r.tenant_name ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [rows, search, tenantFilter, statusFilter, showInactive])

  // Bulk generation covers active locations only; an inactive site needs no new code.
  const missing = useMemo(() => visible.filter((r) => r.is_active && statusOf(r) !== 'ready'), [visible])

  const generateOne = async (r: QrRow): Promise<boolean> => {
    const res = await fetch(`/api/admin/locations/${r.id}/qr`, { method: 'POST', credentials: 'include' })
    return res.ok
  }

  const generate = async (r: QrRow) => {
    setBusyId(r.id)
    try {
      if (!(await generateOne(r))) throw new Error()
      toast.success(t('locations.qr.generated'))
      await load()
    } catch {
      // The dialog shows the bridge's reason.
      setDialogFor(r)
    } finally {
      setBusyId(null)
    }
  }

  const generateMissing = async () => {
    const queue = [...missing]
    let ok = 0
    setBulk({ done: 0, total: queue.length })
    // One at a time: each call uploads to storage and writes a row with a unique key.
    for (const [i, r] of queue.entries()) {
      if (await generateOne(r).catch(() => false)) ok++
      setBulk({ done: i + 1, total: queue.length })
    }
    setBulk(null)
    if (ok) toast.success(t('admin.qr.generated_count', { count: ok }))
    if (ok < queue.length) toast.error(t('admin.qr.failed_count', { count: queue.length - ok }))
    await load()
  }

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('admin.qr.link_copied'))
    } catch {
      window.prompt(t('admin.qr.copy_link'), url)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 text-3xl font-bold text-slate-900">{t('admin.qr.title')}</h1>
            <p className="max-w-2xl text-sm text-slate-500">{t('admin.qr.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={generateMissing}
            disabled={loading || bulk !== null || missing.length === 0}
            className="h-10 rounded-xl bg-purple-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
          >
            {bulk
              ? t('admin.qr.generating_progress', { done: bulk.done, total: bulk.total })
              : t('admin.qr.generate_missing', { count: missing.length })}
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.qr.search')}
            className="h-9 min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} className={SELECT}>
            <option value="all">{t('admin.qr.all_tenants')}</option>
            {tenants.map(([id, name]) => (
              <option key={id} value={String(id)}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Status | 'all')}
            className={SELECT}
          >
            <option value="all">{t('admin.qr.all_statuses')}</option>
            <option value="ready">{t('admin.qr.status_ready')}</option>
            <option value="missing">{t('admin.qr.status_missing')}</option>
            <option value="unlinked">{t('admin.qr.status_unlinked')}</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 accent-purple-600"
            />
            {t('admin.qr.show_inactive')}
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {loading ? (
            <div className="flex items-center justify-center p-16">
              <LoadingSpinner />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">{t('admin.qr.empty')}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="hidden grid-cols-12 gap-3 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
                <div className="col-span-4">{t('admin.qr.col_location')}</div>
                <div className="col-span-2">{t('admin.qr.col_status')}</div>
                <div className="col-span-3">{t('admin.qr.col_link')}</div>
                <div className="col-span-3 text-right">{t('common.actions')}</div>
              </div>
              {visible.map((r) => {
                const status = statusOf(r)
                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-1 items-center gap-3 px-5 py-3 md:grid-cols-12 ${r.is_active ? '' : 'opacity-60'}`}
                  >
                    <div className="flex min-w-0 items-center gap-3 md:col-span-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {r.qr_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- public portal storage URL
                          <img
                            src={r.qr_image_url}
                            alt={t('locations.qr.alt', { location: r.title })}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-lg text-slate-300">—</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                        <p className="truncate text-xs text-slate-500">
                          {r.tenant_name ?? t('common.em_dash')}
                          {r.is_active ? '' : ` · ${t('admin.qr.inactive')}`}
                        </p>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}
                      >
                        {t(`admin.qr.status_${status}`)}
                      </span>
                    </div>
                    <div className="min-w-0 md:col-span-3">
                      {r.intake_url ? (
                        <a
                          href={r.intake_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-xs text-purple-700 hover:underline"
                        >
                          {r.intake_url}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">{t('common.em_dash')}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5 md:col-span-3">
                      {r.intake_url && (
                        <button
                          type="button"
                          onClick={() => copyLink(r.intake_url as string)}
                          className={`${BTN} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
                        >
                          {t('admin.qr.copy_link')}
                        </button>
                      )}
                      {status !== 'ready' && (
                        <button
                          type="button"
                          disabled={busyId !== null || bulk !== null}
                          onClick={() => generate(r)}
                          className={`${BTN} border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100`}
                        >
                          {busyId === r.id ? t('locations.qr.generating') : t('admin.qr.generate')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDialogFor(r)}
                        className={`${BTN} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
                      >
                        {t('admin.qr.open')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {dialogFor && (
        <LocationQrDialog
          endpoint={`/api/admin/locations/${dialogFor.id}/qr`}
          locationTitle={dialogFor.title}
          onClose={() => {
            setDialogFor(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

export default withRoleProtection(AdminQrPage, {
  allowedRoles: [UserRole.ADMIN],
  redirectTo: '/dashboard',
})
