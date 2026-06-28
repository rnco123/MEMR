'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

interface LocationRow {
  id: number
  title: string
  location_code: string | null
  address: string | null
  patientCount: number
  staffCount: number
}

interface Stats {
  totalUsers: number
  doctors: number
  nurses: number
  totalAuditEvents: number
  todayEvents: number
  totalLocations: number
  totalPatients: number
  patientsWithLocation: number
  patientsUnassigned: number
  totalAppointments: number
  activeEncounters: number
  totalPharmacies: number
  locationBreakdown: LocationRow[]
  recentLogins: Array<{
    user_name: string | null
    user_email: string | null
    user_role: string | null
    created_at: string
  }>
  recentActivity: Array<{
    action: string
    user_name: string | null
    user_email: string | null
    resource_type: string | null
    created_at: string
  }>
}

const quickLinkDefs = [
  {
    labelKey: 'admin.ql.users',
    descKey: 'admin.ql.users_desc',
    href: '/admin/users',
    color: 'blue',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    ),
  },
  {
    labelKey: 'admin.ql.audit',
    descKey: 'admin.ql.audit_desc',
    href: '/admin/audit',
    color: 'purple',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    ),
  },
  {
    labelKey: 'admin.ql.flowboard',
    descKey: 'admin.ql.flowboard_desc',
    href: '/admin/flowboard',
    color: 'indigo',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6M4 4h16v16H4V4z" />
    ),
  },
  {
    labelKey: 'admin.ql.patients',
    descKey: 'admin.ql.patients_desc',
    href: '/admin/patients-history',
    color: 'emerald',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 11h8M8 15h5M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
    ),
  },
  {
    labelKey: 'admin.ql.pharmacies',
    descKey: 'admin.ql.pharmacies_desc',
    href: '/admin/pharmacies',
    color: 'amber',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    ),
  },
  {
    labelKey: 'admin.ql.i693',
    descKey: 'admin.ql.i693_desc',
    href: '/admin/i-693',
    color: 'rose',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
  },
]

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'hover:border-blue-200' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'hover:border-purple-200' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'hover:border-indigo-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'hover:border-emerald-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'hover:border-amber-200' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'hover:border-rose-200' },
}

function StatSkeleton() {
  return <span className="inline-block w-12 h-8 bg-slate-100 rounded animate-pulse" />
}

function formatStatValue(value: number | undefined | null, loading: boolean, emDash: string): string | number {
  if (loading) return ''
  if (value === undefined || value === null) return emDash
  return value
}

export default function AdminOverviewPage() {
  const { t, language } = useT()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const quickLinks = useMemo(
    () => quickLinkDefs.map((link) => ({ ...link, label: t(link.labelKey), description: t(link.descKey) })),
    [t]
  )

  const actionLabel = (action: string) => {
    const key = `audit.action.${action}`
    const translated = t(key)
    return translated === key ? action.replace(/_/g, ' ') : translated
  }

  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/stats', { credentials: 'include' })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) {
          if (r.status === 429) {
            throw new Error(
              'Too many API requests. Wait about a minute, then refresh this page.'
            )
          }
          throw new Error(d?.error ?? 'Failed to load stats')
        }
        if (!cancelled) {
          setStats(d as Stats)
          setLoadError(null)
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load stats'
        console.error('Admin stats:', err)
        if (!cancelled) {
          setStats(null)
          setLoadError(message)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const statCards = [
    {
      label: t('admin.stat_staff'),
      value: stats?.totalUsers,
      sub: t('admin.stat_staff_sub', { doctors: stats?.doctors ?? 0, nurses: stats?.nurses ?? 0 }),
      href: '/admin/users',
      color: 'blue',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      ),
    },
    {
      label: t('admin.stat_locations'),
      value: stats?.totalLocations,
      sub: t('admin.stat_locations_sub'),
      href: '/admin/users',
      color: 'purple',
      icon: (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </>
      ),
    },
    {
      label: t('admin.stat_patients'),
      value: stats?.totalPatients,
      sub: t('admin.stat_patients_sub', {
        withLoc: stats?.patientsWithLocation ?? 0,
        unassigned: stats?.patientsUnassigned ?? 0,
      }),
      href: '/admin/patients-history',
      color: 'emerald',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      ),
    },
    {
      label: t('admin.stat_appointments'),
      value: stats?.totalAppointments,
      sub: t('admin.stat_appointments_sub', { active: stats?.activeEncounters ?? 0 }),
      href: '/admin/flowboard',
      color: 'indigo',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      ),
    },
    {
      label: t('admin.stat_audit_today'),
      value: stats?.todayEvents,
      sub: t('admin.stat_audit_sub', { total: stats?.totalAuditEvents ?? 0 }),
      href: '/admin/audit',
      color: 'violet',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      ),
    },
    {
      label: t('admin.stat_pharmacies'),
      value: stats?.totalPharmacies,
      sub: t('admin.stat_pharmacies_sub'),
      href: '/admin/pharmacies',
      color: 'amber',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      ),
    },
  ]

  const iconBg: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.overview_title')}</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t('admin.overview_subtitle')}</p>
      </div>

      {loadError && (
        <div
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          {loadError}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {statCards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 hover:shadow-md hover:border-purple-200 transition-all"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg[c.color]}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {c.icon}
              </svg>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{c.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">
                {loading ? <StatSkeleton /> : formatStatValue(c.value, loading, t('common.em_dash'))}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">{c.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">{t('admin.quick_access')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((link) => {
            const colors =
              colorMap[link.color] ??
              ({ bg: 'bg-purple-50', text: 'text-purple-600', border: 'hover:border-purple-200' } as const)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`group bg-white rounded-2xl border border-slate-200 p-5 ${colors.border} hover:shadow-md transition-all`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${colors.bg}`}>
                  <svg className={`w-5 h-5 ${colors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {link.icon}
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1">{link.label}</h3>
                <p className="text-sm text-slate-500">{link.description}</p>
                <span className={`mt-3 inline-flex items-center text-sm font-medium ${colors.text} group-hover:translate-x-0.5 transition-transform`}>
                  {t('admin.open')}
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Locations + activity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">{t('admin.locations')}</h2>
            <div className="flex items-center gap-3">
              <Link href="/admin/locations" className="text-xs text-purple-600 hover:underline font-medium">
                {t('admin.manage_locations')}
              </Link>
              <Link href="/admin/users" className="text-xs text-purple-600 hover:underline font-medium">
                {t('admin.assign_staff')}
              </Link>
            </div>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : stats?.locationBreakdown?.length ? (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {stats.locationBreakdown.map((loc) => (
                <div key={loc.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{loc.title}</p>
                    {loc.location_code ? (
                      <p className="text-xs text-slate-400">{loc.location_code}</p>
                    ) : null}
                    {loc.address ? (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{loc.address}</p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-600">
                      {t('admin.patients_count', { count: loc.patientCount })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t('admin.staff_count', { count: loc.staffCount })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">{t('admin.no_locations')}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">{t('admin.recent_activity')}</h2>
            <Link href="/admin/audit" className="text-xs text-purple-600 hover:underline font-medium">
              {t('admin.view_all')}
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : stats?.recentActivity?.length ? (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {stats.recentActivity.map((e, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0">
                    {(e.user_name || e.user_email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">
                      <span className="font-medium">{actionLabel(e.action)}</span>
                      {e.resource_type ? (
                        <span className="text-slate-500"> · {e.resource_type}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {e.user_name || e.user_email || t('admin.system')}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-400 whitespace-nowrap">
                    {formatClinicDateTimeForLanguage(e.created_at, language)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">{t('admin.no_activity')}</p>
          )}
        </div>
      </div>

      {/* Recent logins — full width */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">{t('admin.recent_logins')}</h2>
          <Link href="/admin/audit" className="text-xs text-purple-600 hover:underline font-medium">
            {t('admin.view_audit_trail')}
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : stats?.recentLogins?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0 divide-y md:divide-y-0 md:gap-y-2">
            {stats.recentLogins.map((e, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-sm font-semibold text-purple-700 shrink-0">
                  {(e.user_name || e.user_email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {e.user_name || e.user_email || t('common.unknown')}
                  </p>
                  <p className="text-xs text-slate-400 capitalize">{e.user_role || 'unknown'}</p>
                </div>
                <p className="text-xs text-slate-400 whitespace-nowrap">
                  {formatClinicDateTimeForLanguage(e.created_at, language)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-6">{t('admin.no_logins')}</p>
        )}
      </div>
    </div>
  )
}
