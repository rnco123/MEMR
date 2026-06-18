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
  identity_verified_at?: string | null
  prescribing_location_ack_at?: string | null
  ma_supervision_ack_at?: string | null
  ready_for_doctor_at?: string | null
  ma_exam_findings?: string | null
  consent_ack?: Record<string, string> | null
}

interface Props {
  encounterId: number
  encounter: EncounterRooming
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

export function EncounterRoomingPanel({ encounterId, encounter, onUpdated }: Props) {
  const { t } = useT()
  const [saving, setSaving] = useState(false)
  const [findings, setFindings] = useState(encounter.ma_exam_findings ?? '')

  const ack = encounter.consent_ack && typeof encounter.consent_ack === 'object' ? encounter.consent_ack : {}

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
