'use client'

import { useState } from 'react'
import { toast } from 'sonner'

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
}

interface Props {
  encounterId: number
  encounter: EncounterRooming
  pharmacies: { id: number; name: string | null }[]
  onUpdated: () => void
}

const CONSENT_LABELS: { key: ConsentKey; label: string }[] = [
  { key: 'telemedicine', label: 'Telemedicine consent' },
  { key: 'hipaa', label: 'HIPAA acknowledgment' },
  { key: 'cash_pay', label: 'Cash-pay policy' },
  { key: 'texas_ai', label: 'AI usage (Texas)' },
  { key: 'surgery', label: 'Surgery / treatment consent' },
  { key: 'no_insurance', label: 'No insurance billing' },
  { key: 'immigration', label: 'Immigration (if applicable)' },
  { key: 'dot', label: 'DOT (if applicable)' },
  { key: 'ma_supervision', label: 'MA in-room supervision' },
]

export function EncounterRoomingPanel({ encounterId, encounter, pharmacies, onUpdated }: Props) {
  const [saving, setSaving] = useState(false)
  const [findings, setFindings] = useState(encounter.ma_exam_findings ?? '')
  const [pharmacyId, setPharmacyId] = useState<string>(encounter.pharmacy_id ? String(encounter.pharmacy_id) : '')

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
      if (!res.ok) throw new Error(json.error || 'Update failed')
      toast.success('Saved')
      onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
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

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
      <h3 className="text-xl font-bold text-white flex items-center gap-2">
        <span className="text-amber-400">Rooming & compliance</span>
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { k: 'identity_verified' as const, label: 'Identity verified (in person)', at: encounter.identity_verified_at },
          { k: 'prescribing_location_ack' as const, label: 'Prescribing location acknowledged', at: encounter.prescribing_location_ack_at },
          { k: 'ma_supervision_ack' as const, label: 'MA supervision / in-room', at: encounter.ma_supervision_ack_at },
          { k: 'ready_for_doctor' as const, label: 'Ready for doctor', at: encounter.ready_for_doctor_at },
        ].map((row) => (
          <label
            key={row.k}
            className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10"
          >
            <input
              type="checkbox"
              checked={!!row.at}
              disabled={saving}
              onChange={(e) => void patchRooming({ [row.k]: e.target.checked })}
              className="rounded border-white/30"
            />
            <span className="text-sm text-blue-100">{row.label}</span>
          </label>
        ))}
      </div>

      <div>
        <label className="text-sm text-blue-200 block mb-1">Pharmacy</label>
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
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm min-w-[200px]"
          >
            <option value="">— Select pharmacy —</option>
            {pharmacies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || `Pharmacy #${p.id}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="text-sm text-blue-200 mb-2">Consent acknowledgments (timestamp recorded)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CONSENT_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={!!ack[key]}
                disabled={saving}
                onChange={(e) => toggleConsent(key, e.target.checked)}
                className="rounded border-white/30"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm text-blue-200 block mb-1">MA exam findings</label>
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
          placeholder="Document MA-reported findings during exam…"
          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-500"
        />
      </div>
    </div>
  )
}
