'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FilterMultiSelect } from '@/components/FilterMultiSelect'
import { PrescriptionPrintPreviewModal } from '@/components/PrescriptionPrintPreviewModal'
import { useT } from '@/lib/i18n'
import { useUserProfile } from '@/lib/hooks/use-user-profile'
import { resolveDisplayName } from '@/lib/display-name'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'
import {
  summarizeEncounterPrescriptionQueue,
  type AdminPrescriptionReadyRow,
  type PrescriptionReadyDateFilter,
} from '@/lib/prescriptions/load-admin-prescription-ready'

type PharmacyOption = { id: number; name: string }
type LocationOption = { id: number; title: string }
type AdminStatusFilter = 'all' | 'pending' | 'sent_to_pharmacy'

function sameIdList(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function pruneSelectedIds(prev: number[], optionIds: number[]): number[] {
  if (prev.length === 0) return prev
  const allowed = new Set(optionIds)
  const next = prev.filter((id) => allowed.has(id))
  return sameIdList(prev, next) ? prev : next
}

function filterBadgeClass(
  active: boolean,
  tone: 'neutral' | 'pending' | 'sent' | 'date' | 'dateMonth',
  compact = false
) {
  const size = compact
    ? 'rounded-full px-2 py-1 text-[11px] font-semibold border transition-colors disabled:opacity-50'
    : 'rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-50'
  if (!active) {
    return `${size} bg-white text-slate-600 border-slate-200 hover:bg-slate-50`
  }
  switch (tone) {
    case 'pending':
      return `${size} bg-amber-100 text-amber-900 border-amber-300`
    case 'sent':
      return `${size} bg-emerald-100 text-emerald-900 border-emerald-300`
    case 'date':
      return `${size} bg-violet-100 text-violet-900 border-violet-300`
    case 'dateMonth':
      return `${size} bg-sky-100 text-sky-900 border-sky-300`
    default:
      return `${size} bg-slate-800 text-white border-slate-800`
  }
}

export default function AdminPrescriptionsPage() {
  const { t, language } = useT()
  const { profile } = useUserProfile()
  const [rows, setRows] = useState<AdminPrescriptionReadyRow[]>([])
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedPharmacyIds, setSelectedPharmacyIds] = useState<number[]>([])
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([])
  const [status, setStatus] = useState<AdminStatusFilter>('pending')
  const [prescriptionDate, setPrescriptionDate] = useState<PrescriptionReadyDateFilter>('all')
  const [updatingEncounterId, setUpdatingEncounterId] = useState<number | null>(null)
  const [previewEncounter, setPreviewEncounter] = useState<{
    encounterId: number
    prescriptionIds: number[]
    subtitle: string
  } | null>(null)

  const pharmacyFilterKey = selectedPharmacyIds.join(',')
  const locationFilterKey = selectedLocationIds.join(',')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedPharmacyIds.length > 0) {
        params.set('pharmacy_ids', selectedPharmacyIds.join(','))
      }
      if (selectedLocationIds.length > 0) {
        params.set('location_ids', selectedLocationIds.join(','))
      }
      params.set('status', status)
      if (prescriptionDate !== 'all') params.set('prescription_date', prescriptionDate)
      const res = await fetch(`/api/admin/prescription-ready?${params.toString()}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.prescriptions.load_failed'))
      const nextPharmacies: PharmacyOption[] = json.pharmacies ?? []
      const nextLocations: LocationOption[] = json.locations ?? []
      setRows(json.rows ?? [])
      setPharmacies(nextPharmacies)
      setLocations(nextLocations)
      setTotalCount(typeof json.totalCount === 'number' ? json.totalCount : (json.rows ?? []).length)
      const pharmacyOptionIds = nextPharmacies.map((p) => p.id)
      const locationOptionIds = nextLocations.map((l) => l.id)
      setSelectedPharmacyIds((prev) => pruneSelectedIds(prev, pharmacyOptionIds))
      setSelectedLocationIds((prev) => pruneSelectedIds(prev, locationOptionIds))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.prescriptions.load_failed'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [pharmacyFilterKey, locationFilterKey, status, prescriptionDate, t])

  useEffect(() => {
    const timer = setTimeout(() => void fetchRows(), 250)
    return () => clearTimeout(timer)
  }, [fetchRows])

  const groupedByEncounter = useMemo(() => {
    const map = new Map<number, AdminPrescriptionReadyRow[]>()
    for (const row of rows) {
      const list = map.get(row.encounter_id) ?? []
      list.push(row)
      map.set(row.encounter_id, list)
    }
    return map
  }, [rows])

  const updateEncounterStatus = async (
    encounterId: number,
    admin_status: 'pending' | 'sent_to_pharmacy'
  ) => {
    const encounterRows = rows.filter((row) => row.encounter_id === encounterId)
    if (encounterRows.length === 0) return

    const previousRows = rows
    const previousTotalCount = totalCount
    const updatedAt = new Date().toISOString()
    const updaterName = resolveDisplayName({
      full_name: profile?.full_name,
      email: profile?.email,
      fallback: t('common.system'),
    })

    setUpdatingEncounterId(encounterId)
    setRows((prev) => {
      const next = prev.map((row) =>
        row.encounter_id === encounterId
          ? {
              ...row,
              admin_status,
              admin_status_updated_at: updatedAt,
              admin_status_updated_by_name: updaterName,
            }
          : row
      )
      if (status !== 'all' && status !== admin_status) {
        return next.filter((row) => row.encounter_id !== encounterId)
      }
      return next
    })
    if (status !== 'all' && status !== admin_status) {
      setTotalCount((count) => Math.max(0, count - encounterRows.length))
    }

    try {
      const res = await fetch(`/api/admin/prescription-ready/encounter/${encounterId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.prescriptions.status_failed'))

      const serverUpdatedAt =
        typeof json.admin_status_updated_at === 'string' ? json.admin_status_updated_at : updatedAt

      setRows((prev) => {
        const stillVisible = status === 'all' || status === admin_status
        if (!stillVisible) return prev
        return prev.map((row) =>
          row.encounter_id === encounterId
            ? {
                ...row,
                admin_status,
                admin_status_updated_at: serverUpdatedAt,
                admin_status_updated_by_name: updaterName,
              }
            : row
        )
      })
    } catch (e) {
      setRows(previousRows)
      setTotalCount(previousTotalCount)
      toast.error(e instanceof Error ? e.message : t('admin.prescriptions.status_failed'))
    } finally {
      setUpdatingEncounterId(null)
    }
  }

  const formatWhen = (iso: string) => formatClinicDateTimeForLanguage(iso, language)

  const locationOptions = useMemo(
    () => locations.map((loc) => ({ id: loc.id, label: loc.title })),
    [locations]
  )
  const pharmacyOptions = useMemo(
    () => pharmacies.map((p) => ({ id: p.id, label: p.name })),
    [pharmacies]
  )

  const filterLabelClass =
    'text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap shrink-0'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.prescriptions.title')}</h1>
        <p className="text-sm text-slate-600 mt-1">{t('admin.prescriptions.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <FilterMultiSelect
          label={t('admin.prescriptions.filter_location')}
          options={locationOptions}
          selectedIds={selectedLocationIds}
          onChange={setSelectedLocationIds}
          allLabel={t('admin.prescriptions.all_locations')}
        />

        <div className="w-px h-10 bg-slate-200 shrink-0 self-center" aria-hidden />

        <FilterMultiSelect
          label={t('admin.prescriptions.filter_pharmacy')}
          options={pharmacyOptions}
          selectedIds={selectedPharmacyIds}
          onChange={setSelectedPharmacyIds}
          allLabel={t('admin.prescriptions.all_pharmacies')}
        />

        <div className="hidden sm:block w-px h-10 bg-slate-200 shrink-0 self-center" aria-hidden />

        <div className="flex flex-col gap-1.5">
          <span className={filterLabelClass}>{t('admin.prescriptions.filter_status')}</span>
          <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: 'all' as const, label: t('admin.prescriptions.status_all'), tone: 'neutral' as const },
              { value: 'pending' as const, label: t('admin.prescriptions.status_pending'), tone: 'pending' as const },
              {
                value: 'sent_to_pharmacy' as const,
                label: t('admin.prescriptions.status_sent'),
                tone: 'sent' as const,
              },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={filterBadgeClass(status === option.value, option.tone, true)}
            >
              {option.label}
            </button>
          ))}
          </div>
        </div>

        <div className="hidden sm:block w-px h-10 bg-slate-200 shrink-0 self-center" aria-hidden />

        <div className="flex flex-col gap-1.5">
          <span className={filterLabelClass}>{t('admin.prescriptions.filter_prescription_date')}</span>
          <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: 'all' as const, label: t('admin.prescriptions.date_all'), tone: 'neutral' as const },
              { value: 'today' as const, label: t('admin.prescriptions.date_today'), tone: 'date' as const },
              {
                value: 'this_month' as const,
                label: t('admin.prescriptions.date_this_month'),
                tone: 'dateMonth' as const,
              },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPrescriptionDate(option.value)}
              className={filterBadgeClass(prescriptionDate === option.value, option.tone, true)}
            >
              {option.label}
            </button>
          ))}
          </div>
        </div>

        {!loading ? (
          <p className="text-xs text-slate-500 sm:ml-auto shrink-0 pb-0.5">
            {t('admin.prescriptions.showing_count', { count: groupedByEncounter.size })}
          </p>
        ) : null}
      </div>

      {loading ? (
        <LoadingSpinner message={t('common.loading')} />
      ) : rows.length === 0 ? (
        <p className="text-slate-600 text-sm rounded-xl border border-slate-200 bg-white p-8 text-center">
          {t('admin.prescriptions.empty')}
        </p>
      ) : (
        <div className="space-y-6">
          {[...groupedByEncounter.entries()].map(([encounterId, encRows]) => {
            const first = encRows[0]
            if (!first) return null
            const patientName = [first.patient_first_name, first.patient_last_name].filter(Boolean).join(' ')
            const rxIds = encRows.map((r) => r.prescription_id)
            const queueSummary = summarizeEncounterPrescriptionQueue(encRows)
            return (
              <div
                key={encounterId}
                className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{patientName || t('common.unknown')}</p>
                    <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span>
                        {t('admin.prescriptions.encounter_label', {
                          code: first.encounter_code || String(encounterId),
                        })}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                        {t('admin.prescriptions.encounter_rx_count', { count: encRows.length })}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {t('admin.prescriptions.sent_by', {
                          name: first.sender_name || t('common.unknown'),
                          role: first.sender_role,
                        })}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{formatWhen(first.sent_to_admin_at)}</span>
                    </p>
                    {first.pharmacy_name ? (
                      <p className="text-xs text-violet-700 mt-1 font-medium">
                        {t('admin.prescriptions.pharmacy')}: {first.pharmacy_name}
                        {first.pharmacy_phone ? ` · ${first.pharmacy_phone}` : ''}
                        {first.pharmacy_email ? ` · ${first.pharmacy_email}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-700 mt-1">{t('admin.prescriptions.no_pharmacy')}</p>
                    )}
                    {first.pharmacy_address ? (
                      <p className="text-xs text-slate-600 mt-0.5">{first.pharmacy_address}</p>
                    ) : null}
                    <div className="mt-3 pt-3 border-t border-slate-200/80">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        {t('admin.prescriptions.col_status')}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              {
                                value: 'pending' as const,
                                label: t('admin.prescriptions.status_pending'),
                                tone: 'pending' as const,
                              },
                              {
                                value: 'sent_to_pharmacy' as const,
                                label: t('admin.prescriptions.status_sent'),
                                tone: 'sent' as const,
                              },
                            ] as const
                          ).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              disabled={updatingEncounterId === encounterId}
                              onClick={() => {
                                if (queueSummary.admin_status !== option.value) {
                                  void updateEncounterStatus(encounterId, option.value)
                                }
                              }}
                              className={filterBadgeClass(
                                queueSummary.admin_status === option.value,
                                option.tone
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500">
                          {t('admin.prescriptions.col_status_updated')}:{' '}
                          {queueSummary.admin_status_updated_at
                            ? formatWhen(queueSummary.admin_status_updated_at)
                            : t('common.system')}
                          {' · '}
                          {t('admin.prescriptions.col_updated_by')}:{' '}
                          {queueSummary.admin_status_updated_by_name ?? t('common.system')}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">
                        {t('admin.prescriptions.status_encounter_hint')}
                      </p>
                      {queueSummary.hasMixedStatus ? (
                        <p className="text-xs text-amber-700 mt-1">
                          {t('admin.prescriptions.status_mixed_notice')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewEncounter({
                          encounterId,
                          prescriptionIds: rxIds,
                          subtitle: t('admin.prescriptions.encounter_label', {
                            code: first.encounter_code ?? String(encounterId),
                          }),
                        })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t('common.view')}
                    </button>
                    <Link
                      href={`/admin/patient-file/${first.patient_id}`}
                      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
                    >
                      {t('admin.prescriptions.open_patient')}
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <PrescriptionPrintPreviewModal
        open={previewEncounter != null}
        onClose={() => setPreviewEncounter(null)}
        encounterId={previewEncounter?.encounterId ?? null}
        prescriptionIds={previewEncounter?.prescriptionIds ?? []}
        subtitle={previewEncounter?.subtitle}
      />
    </div>
  )
}
