'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { isForbiddenResponse } from '@/lib/http/api-response'
import { canJoinTelemedicine } from '@/lib/encounter-status'

interface EncounterRooming {
  id: number
  status?: string | null
  identity_verified_at?: string | null
  ma_supervision_ack_at?: string | null
  ready_for_doctor_at?: string | null
}

interface Props {
  encounterId: number
  encounter: EncounterRooming
  readOnly?: boolean
  onUpdated: () => void
}

export function EncounterRoomingPanel({ encounterId, encounter, readOnly = false, onUpdated }: Props) {
  const { t } = useT()
  const [saving, setSaving] = useState(false)

  const patchRooming = async (body: Record<string, unknown>) => {
    if (readOnly) return
    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/rooming`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        throw new Error(json.error || t('encounter_modal.toast_save_failed'))
      }
      toast.success(t('encounter_modal.toast_saved'))
      onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.toast_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const workflowRows = [
    {
      k: 'identity_verified' as const,
      labelKey: 'encounter_modal.rooming_identity',
      at: encounter.identity_verified_at,
    },
    {
      k: 'ma_supervision_ack' as const,
      labelKey: 'encounter_modal.rooming_ma_supervision',
      at: encounter.ma_supervision_ack_at,
    },
  ]

  const readyForDoctor = !!encounter.ready_for_doctor_at
  // The provider board lists a patient only once vitals are saved (status reaches
  // vitals_assessed) AND rooming is marked ready, so warn when half the pair is missing.
  const vitalsAssessed = canJoinTelemedicine(encounter.status)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">{t('encounter_modal.rooming_title')}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {workflowRows.map((row) => (
          <label
            key={row.k}
            className={`flex items-center gap-3 p-3 rounded-xl bg-[#f9fbff] border border-slate-200 transition-colors ${
              readOnly ? '' : 'cursor-pointer hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              checked={!!row.at}
              disabled={saving || readOnly}
              onChange={(e) => void patchRooming({ [row.k]: e.target.checked })}
              className="rounded border-slate-300 text-[#2E6EF3] focus:ring-[#2E6EF3]/35"
            />
            <span className="text-sm text-slate-800">{t(row.labelKey)}</span>
          </label>
        ))}
      </div>

      {/* Handoff to the provider: stamping this puts the patient on the physician
          flowboard's "ready for telemedicine" tiles. */}
      <label
        className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
          readyForDoctor
            ? 'bg-emerald-50/80 border-emerald-200'
            : 'bg-[#f9fbff] border-slate-200'
        } ${readOnly ? '' : 'cursor-pointer hover:border-emerald-300'}`}
      >
        <input
          type="checkbox"
          checked={readyForDoctor}
          disabled={saving || readOnly}
          onChange={(e) => void patchRooming({ ready_for_doctor: e.target.checked })}
          className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/35"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900">
            {t('encounter_modal.rooming_ready_doctor')}
          </span>
          <span className="block text-xs text-slate-500 mt-0.5">
            {t('encounter_modal.rooming_ready_doctor_hint')}
          </span>
          {readyForDoctor && (
            <span className="block text-xs text-emerald-800 font-medium mt-1">
              {t('encounter_modal.rooming_ready_doctor_at', {
                time: new Date(encounter.ready_for_doctor_at!).toLocaleString(),
              })}
            </span>
          )}
          {readyForDoctor && !vitalsAssessed && (
            <span className="block text-xs text-amber-800 font-medium mt-1">
              {t('encounter_modal.rooming_ready_doctor_needs_vitals')}
            </span>
          )}
        </span>
      </label>
    </div>
  )
}
