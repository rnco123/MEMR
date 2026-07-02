'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useT } from '@/lib/i18n'
import { getRoleI18nKey } from '@/lib/roles'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

interface AuditRow {
  id: string
  user_id: string | null
  user_email: string | null
  user_name: string | null
  user_role: string | null
  action: string
  resource_type: string
  resource_id: string | null
  page_url: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const AUDIT_ACTION_KEYS = [
  'user_logged_in',
  'user_logged_out',
  'user_created',
  'user_deleted',
  'patient_viewed',
  'patient_created',
  'patient_updated',
  'patient_deleted',
  'encounter_viewed',
  'encounter_created',
  'encounter_updated',
  'vitals_recorded',
  'appointment_created',
  'document_viewed',
  'document_uploaded',
  'document_deleted',
  'prescription_created',
  'prescription_updated',
  'prescription_deleted',
  'prescription_viewed',
  'video_session_started',
  'data_exported',
  'i693_viewed',
  'i693_saved',
  'i693_ai_filled',
  'i693_pdf_exported',
  'i693_workflow_updated',
  'page_view',
  'button_click',
] as const

const ACTION_COLORS: Record<string, string> = {
  user_logged_in: 'bg-green-50 text-green-700',
  user_logged_out: 'bg-orange-50 text-orange-700',
  user_created: 'bg-purple-50 text-purple-700',
  user_deleted: 'bg-rose-50 text-rose-700',
  patient_viewed: 'bg-blue-50 text-blue-700',
  patient_created: 'bg-cyan-50 text-cyan-700',
  encounter_viewed: 'bg-sky-50 text-sky-700',
  vitals_recorded: 'bg-emerald-50 text-emerald-700',
  prescription_created: 'bg-lime-50 text-lime-700',
  prescription_updated: 'bg-lime-50 text-lime-800',
  prescription_viewed: 'bg-stone-50 text-stone-600',
  video_session_started: 'bg-pink-50 text-pink-700',
  data_exported: 'bg-yellow-50 text-yellow-700',
  i693_viewed: 'bg-indigo-50 text-indigo-700',
  i693_saved: 'bg-violet-50 text-violet-700',
  i693_ai_filled: 'bg-fuchsia-50 text-fuchsia-700',
  i693_pdf_exported: 'bg-amber-50 text-amber-800',
  i693_workflow_updated: 'bg-teal-50 text-teal-700',
  page_view: 'bg-slate-50 text-slate-500',
}

const ROLE_OPTIONS = ['doctor', 'fnp', 'pa', 'nurse', 'admin'] as const

export default function AdminAuditPage() {
  const { t, language } = useT()
  const localeTag = language === 'es' ? 'es-ES' : 'en-US'
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const limit = 50

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const actionLabel = useCallback(
    (action: string) => {
      const key = `audit.action.${action}`
      const translated = t(key)
      return translated === key ? action : translated
    },
    [t]
  )

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) params.set('search', search)
    if (actionFilter) params.set('action', actionFilter)
    if (roleFilter) params.set('role', roleFilter)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate + 'T23:59:59')
    try {
      const res = await fetch(`/api/admin/audit?${params}`)
      const data = await res.json()
      setRows(data.rows ?? [])
      setTotal(data.total ?? 0)
    } catch {
      // ignore
    }
    setLoading(false)
  }, [page, search, actionFilter, roleFilter, fromDate, toDate])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(load, 5000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoRefresh, load])

  const totalPages = Math.ceil(total / limit)

  const formatTime = (ts: string) =>
    formatClinicDateTimeForLanguage(ts, language, {
      appendCt: true,
      intl: {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      },
    })

  const badgeColor = (action: string) => ACTION_COLORS[action] ?? 'bg-slate-50 text-slate-600'

  const roleLabel = (role: string) => t(getRoleI18nKey(role))

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.audit.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('admin.audit.subtitle', { total: total.toLocaleString(localeTag) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <div
              onClick={() => setAutoRefresh((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${autoRefresh ? 'bg-green-500' : 'bg-slate-200'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoRefresh ? 'translate-x-5' : ''}`}
              />
            </div>
            {t('admin.audit.live')}
          </label>
          <button
            onClick={load}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors"
          >
            {t('common.refresh')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder={t('admin.audit.search')}
          className="flex-1 min-w-[200px] h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value)
            setPage(1)
          }}
          className="h-9 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="">{t('admin.audit.all_actions')}</option>
          {AUDIT_ACTION_KEYS.map((v) => (
            <option key={v} value={v}>
              {actionLabel(v)}
            </option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value)
            setPage(1)
          }}
          className="h-9 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="">{t('admin.audit.all_roles')}</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-0.5">
            {t('admin.audit.date_from')}
          </span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setPage(1)
            }}
            aria-label={t('admin.audit.date_from')}
            className="h-9 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-0.5">
            {t('admin.audit.date_to')}
          </span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setPage(1)
            }}
            aria-label={t('admin.audit.date_to')}
            className="h-9 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </label>
        {(search || actionFilter || roleFilter || fromDate || toDate) && (
          <button
            onClick={() => {
              setSearch('')
              setActionFilter('')
              setRoleFilter('')
              setFromDate('')
              setToDate('')
              setPage(1)
            }}
            className="h-9 px-3 text-sm text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            {t('admin.audit.clear')}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-5 py-3 items-center">
                <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
                <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
                <div className="flex-1 h-3 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">{t('admin.audit.no_events')}</div>
        ) : (
          <>
            <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <div className="col-span-2">{t('admin.audit.col_time')}</div>
              <div className="col-span-2">{t('admin.audit.col_user')}</div>
              <div className="col-span-1">{t('admin.audit.col_role')}</div>
              <div className="col-span-2">{t('admin.audit.col_action')}</div>
              <div className="col-span-2">{t('admin.audit.col_resource')}</div>
              <div className="col-span-2">{t('admin.audit.col_page')}</div>
              <div className="col-span-1">{t('admin.audit.col_ip')}</div>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((row) => (
                <div key={row.id}>
                  <div
                    className="grid grid-cols-12 gap-3 px-5 py-2.5 items-center text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <div className="col-span-2 text-xs text-slate-400 font-mono whitespace-nowrap">
                      {formatTime(row.created_at)}
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{row.user_name || t('common.em_dash')}</p>
                      <p className="text-[11px] text-slate-400 truncate">{row.user_email || ''}</p>
                    </div>
                    <div className="col-span-1">
                      {row.user_role && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                          {roleLabel(row.user_role)}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor(row.action)}`}>
                        {actionLabel(row.action)}
                      </span>
                    </div>
                    <div className="col-span-2 text-xs text-slate-500 min-w-0">
                      <p className="capitalize">{row.resource_type}</p>
                      {row.resource_id && <p className="text-slate-300 truncate">#{row.resource_id}</p>}
                    </div>
                    <div className="col-span-2 text-[11px] text-slate-400 truncate" title={row.page_url ?? undefined}>
                      {row.page_url ? row.page_url.replace(/^https?:\/\/[^/]+/, '') : t('common.em_dash')}
                    </div>
                    <div className="col-span-1 text-[11px] text-slate-400 truncate">
                      {row.ip_address || t('common.em_dash')}
                    </div>
                  </div>
                  {expanded === row.id && (
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs space-y-1">
                      {row.user_agent && (
                        <p className="text-slate-400">
                          <span className="font-medium text-slate-600">{t('admin.audit.user_agent')}</span> {row.user_agent}
                        </p>
                      )}
                      {row.page_url && (
                        <p className="text-slate-400">
                          <span className="font-medium text-slate-600">{t('admin.audit.url')}</span> {row.page_url}
                        </p>
                      )}
                      {row.metadata && (
                        <pre className="mt-1 text-slate-500 bg-white border border-slate-200 rounded-lg p-2 overflow-auto max-h-28">
                          {JSON.stringify(row.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500">
            {t('admin.audit.showing', {
              start: (page - 1) * limit + 1,
              end: Math.min(page * limit, total),
              total: total.toLocaleString(localeTag),
            })}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              {t('common.previous')}
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const p = i + 1
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 border rounded-lg transition-colors ${page === p ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
