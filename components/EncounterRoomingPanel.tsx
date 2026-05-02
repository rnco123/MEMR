'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

type ConsentKey =
  | 'telemedicine'
  | 'hipaa'
  | 'cash_pay'
  | 'texas_ai'
  | 'surgery'
  | 'no_insurance'
  | 'immigration'
  | 'dot'
  | 'ma_supervision'

interface EncounterRooming {
  id: number
  pharmacy_id?: number | null
  identity_verified_at?: string | null
  prescribing_location_ack_at?: string | null
  ma_supervision_ack_at?: string | null
  ready_for_doctor_at?: string | null
  ma_exam_findings?: string | null
  consent_ack?: Record<string, string> | null
  mcm_encounter_id?: number | null
  mcm_sync_status?: 'not_copied' | 'copy_in_progress' | 'copied' | 'copy_failed' | string | null
  mcm_sync_error?: string | null
  mcm_synced_at?: string | null
}

interface Props {
  encounterId: number
  encounter: EncounterRooming
  pharmacies: { id: number; name: string | null }[]
  onUpdated: () => void
}

const CONSENT_LABEL_KEYS: { key: ConsentKey; labelKey: string }[] = [
  { key: 'telemedicine', labelKey: 'encounter_modal.consent_telemedicine' },
  { key: 'hipaa', labelKey: 'encounter_modal.consent_hipaa' },
  { key: 'cash_pay', labelKey: 'encounter_modal.consent_cash_pay' },
  { key: 'texas_ai', labelKey: 'encounter_modal.consent_texas_ai' },
  { key: 'surgery', labelKey: 'encounter_modal.consent_surgery' },
  { key: 'no_insurance', labelKey: 'encounter_modal.consent_no_insurance' },
  { key: 'immigration', labelKey: 'encounter_modal.consent_immigration' },
  { key: 'dot', labelKey: 'encounter_modal.consent_dot' },
  { key: 'ma_supervision', labelKey: 'encounter_modal.consent_ma_supervision' },
]

export function EncounterRoomingPanel({ encounterId, encounter, pharmacies, onUpdated }: Props) {
  const { t } = useT()
  const [saving, setSaving] = useState(false)
  const [syncingToMcm, setSyncingToMcm] = useState(false)
  const [findings, setFindings] = useState(encounter.ma_exam_findings ?? '')
  const [pharmacyId, setPharmacyId] = useState<string>(encounter.pharmacy_id ? String(encounter.pharmacy_id) : '')

  const ack = encounter.consent_ack && typeof encounter.consent_ack === 'object' ? encounter.consent_ack : {}

  const selectClass =
    'bg-[#f9fbff] border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm min-w-[200px] focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/35 focus:border-[#2E6EF3] disabled:opacity-50 disabled:bg-slate-50 [color-scheme:light]'

  const patchRooming = async (body: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/rooming`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('encounter_modal.toast_save_failed'))
      toast.success(t('encounter_modal.toast_saved'))
      onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.toast_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const toggleConsent = (key: ConsentKey, checked: boolean) => {
    const next = { ...ack }
    if (checked) next[key] = new Date().toISOString()
    else delete next[key]
    void patchRooming({ consent_ack: next })
  }

  const syncEncounterToMcm = async () => {
    setSyncingToMcm(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/mcm-sync`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('encounter_modal.toast_mcm_failed'))
      toast.success(t('encounter_modal.toast_mcm_copied', { id: json.mcm_encounter_id }))
      onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.toast_mcm_failed'))
    } finally {
      setSyncingToMcm(false)
    }
  }

  const mcmStatus = encounter.mcm_sync_status || 'not_copied'
  const mcmStatusClass =
    mcmStatus === 'copied'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : mcmStatus === 'copy_failed'
        ? 'bg-red-50 text-red-800 border-red-200'
        : mcmStatus === 'copy_in_progress'
          ? 'bg-amber-50 text-amber-900 border-amber-200'
          : 'bg-slate-50 text-slate-700 border-slate-200'

  const workflowRows = [
    {
      k: 'identity_verified' as const,
      labelKey: 'encounter_modal.rooming_identity',
      at: encounter.identity_verified_at,
    },
    {
      k: 'prescribing_location_ack' as const,
      labelKey: 'encounter_modal.rooming_prescribing_loc',
      at: encounter.prescribing_location_ack_at,
    },
    {
      k: 'ma_supervision_ack' as const,
      labelKey: 'encounter_modal.rooming_ma_supervision',
      at: encounter.ma_supervision_ack_at,
    },
    {
      k: 'ready_for_doctor' as const,
      labelKey: 'encounter_modal.rooming_ready_doctor',
      at: encounter.ready_for_doctor_at,
    },
  ]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">{t('encounter_modal.rooming_title')}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {workflowRows.map((row) => (
          <label
            key={row.k}
            className="flex items-center gap-3 p-3 rounded-xl bg-[#f9fbff] border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
          >
            <input
              type="checkbox"
              checked={!!row.at}
              disabled={saving}
              onChange={(e) => void patchRooming({ [row.k]: e.target.checked })}
              className="rounded border-slate-300 text-[#2E6EF3] focus:ring-[#2E6EF3]/35"
            />
            <span className="text-sm text-slate-800">{t(row.labelKey)}</span>
          </label>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-[#f9fbff] p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm text-slate-500 mb-1">{t('encounter_modal.rooming_mcm_status')}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-lg border text-xs font-medium uppercase tracking-wide ${mcmStatusClass}`}>
                {mcmStatus.replaceAll('_', ' ')}
              </span>
              {encounter.mcm_encounter_id && (
                <span className="text-xs text-emerald-800 font-medium">
                  {t('encounter_modal.rooming_mcm_encounter_id')} {encounter.mcm_encounter_id}
                </span>
              )}
            </div>
            {encounter.mcm_sync_error && (
              <p className="text-xs text-red-700 mt-2">{encounter.mcm_sync_error}</p>
            )}
          </div>
          <button
            type="button"
            disabled={syncingToMcm || saving}
            onClick={syncEncounterToMcm}
            className="px-4 py-2 bg-[#2E6EF3] hover:bg-[#256ae8] text-white rounded-xl text-sm font-semibold disabled:opacity-50 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/50"
          >
            {syncingToMcm ? t('encounter_modal.rooming_copying') : t('encounter_modal.rooming_copy_mcm')}
          </button>
        </div>
      </div>

      <div>
        <label className="text-sm text-slate-500 block mb-1">{t('encounter_modal.rooming_pharmacy')}</label>
        <div className="flex gap-2 flex-wrap">
          <select
            value={pharmacyId}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value
              setPharmacyId(v)
              const num = v ? Number(v) : null
              void patchRooming({ pharmacy_id: num })
            }}
            className={`${selectClass} cursor-pointer`}
          >
            <option value="">{t('encounter_modal.rooming_pharmacy_select')}</option>
            {pharmacies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || t('encounter_modal.pharmacy_numbered', { id: p.id })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="text-sm text-slate-500 mb-2">{t('encounter_modal.rooming_consent_header')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CONSENT_LABEL_KEYS.map(({ key, labelKey }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={!!ack[key]}
                disabled={saving}
                onChange={(e) => toggleConsent(key, e.target.checked)}
                className="rounded border-slate-300 text-[#2E6EF3] focus:ring-[#2E6EF3]/35"
              />
              {t(labelKey)}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm text-slate-500 block mb-1">{t('encounter_modal.rooming_ma_findings')}</label>
        <textarea
          value={findings}
          disabled={saving}
          onChange={(e) => setFindings(e.target.value)}
          onBlur={() => {
            if (findings !== (encounter.ma_exam_findings ?? '')) {
              void patchRooming({ ma_exam_findings: findings || null })
            }
          }}
          rows={4}
          placeholder={t('encounter_modal.rooming_ma_placeholder')}
          className="w-full bg-[#f9fbff] border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/35 focus:border-[#2E6EF3] disabled:opacity-50 disabled:bg-slate-50 [color-scheme:light]"
        />
      </div>
    </div>
  )
}
