'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { useT } from '@/lib/i18n'
import { UserRole } from '@/lib/roles'

type Stats = {
  totalStaff: number
  doctors: number
  nurses: number
  totalLocations: number
  totalPatients: number
  totalAppointments: number
  activeEncounters: number
  recentLogins: Array<{ user_name: string | null; user_email: string | null; user_role: string | null; created_at: string }>
  locationBreakdown: Array<{
    id: number
    title: string
    location_code: string | null
    address: string | null
    patientCount: number
    staffCount: number
  }>
}

/** Clinic manager dashboard: the admin overview's numbers for this tenant, read-only. */
function ManageDashboardPage() {
  const { t, language } = useT()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/manage/stats', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((json: Stats) => setStats(json))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  const cards = [
    {
      label: t('admin.stat_staff'),
      value: stats?.totalStaff,
      sub: t('admin.stat_staff_sub', { doctors: stats?.doctors ?? 0, nurses: stats?.nurses ?? 0 }),
      href: '/manage/staff',
    },
    { label: t('admin.stat_locations'), value: stats?.totalLocations, sub: t('manage.dashboard.locations_sub'), href: null },
    { label: t('admin.stat_patients'), value: stats?.totalPatients, sub: t('manage.dashboard.patients_sub'), href: '/manage/patients-history' },
    {
      label: t('admin.stat_appointments'),
      value: stats?.totalAppointments,
      sub: t('admin.stat_appointments_sub', { active: stats?.activeEncounters ?? 0 }),
      href: '/manage/flowboard',
    },
  ]

  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString(language === 'es' ? 'es-ES' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('manage.dashboard.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('manage.dashboard.subtitle')}</p>
      </div>

      {failed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          {t('manage.dashboard.load_failed')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              <p className="mt-0.5 text-2xl font-bold text-slate-900">
                {loading ? (
                  <span className="inline-block h-8 w-12 animate-pulse rounded bg-slate-100" />
                ) : (
                  (c.value ?? t('common.em_dash'))
                )}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">{c.sub}</p>
            </>
          )
          const cls = 'rounded-2xl border border-slate-200 bg-white p-4'
          return c.href ? (
            <Link key={c.label} href={c.href} className={`${cls} transition-all hover:border-[#2E6EF3]/40 hover:shadow-md`}>
              {body}
            </Link>
          ) : (
            <div key={c.label} className={cls}>
              {body}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">{t('admin.locations')}</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-50" />
              ))}
            </div>
          ) : stats?.locationBreakdown.length ? (
            <div className="divide-y divide-slate-100">
              {stats.locationBreakdown.map((loc) => (
                <div key={loc.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{loc.title}</p>
                    {loc.address ? <p className="mt-0.5 truncate text-xs text-slate-500">{loc.address}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-600">{t('admin.patients_count', { count: loc.patientCount })}</p>
                    <p className="text-xs text-slate-500">{t('admin.staff_count', { count: loc.staffCount })}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('manage.staff.no_locations')}</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">{t('admin.recent_logins')}</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-50" />
              ))}
            </div>
          ) : stats?.recentLogins.length ? (
            <div className="divide-y divide-slate-100">
              {stats.recentLogins.map((l, i) => (
                <div key={`${l.created_at}-${i}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{l.user_name || l.user_email || t('common.unknown')}</p>
                    {l.user_role ? <p className="text-xs capitalize text-slate-400">{l.user_role}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{formatWhen(l.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('admin.no_logins')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default withRoleProtection(ManageDashboardPage, { allowedRoles: [UserRole.CLINIC_MANAGER] })
