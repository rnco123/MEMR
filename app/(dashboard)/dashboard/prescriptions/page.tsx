'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'

type Row = {
  id: number
  patient_id: number
  encounter_id: number | null
  medication_name: string
  dosage: string | null
  instructions: string | null
  quantity: string | null
  refills: number
  status: string
  external_rx_id: string | null
  notes: string | null
  created_at: string
  patients: { first_name: string; last_name: string } | null
}

function PrescriptionsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    patient_id: '',
    encounter_id: '',
    medication_name: '',
    dosage: '',
    instructions: '',
    quantity: '',
    refills: '0',
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/prescriptions', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setRows(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load prescriptions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const patient_id = Number(form.patient_id)
      if (!Number.isFinite(patient_id)) {
        toast.error('Valid patient ID is required')
        return
      }
      const encounter_id = form.encounter_id.trim() ? Number(form.encounter_id) : null
      if (form.encounter_id.trim() && !Number.isFinite(encounter_id)) {
        toast.error('Invalid encounter ID')
        return
      }
      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id,
          encounter_id,
          medication_name: form.medication_name.trim(),
          dosage: form.dosage.trim() || null,
          instructions: form.instructions.trim() || null,
          quantity: form.quantity.trim() || null,
          refills: Number(form.refills) || 0,
          notes: form.notes.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      toast.success('Prescription recorded')
      setForm({
        patient_id: '',
        encounter_id: '',
        medication_name: '',
        dosage: '',
        instructions: '',
        quantity: '',
        refills: '0',
        notes: '',
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">E-Prescribe / prescriptions</h1>
        <p className="text-blue-200/90 text-sm max-w-2xl">
          Medications you have recorded as prescriber. External e-prescribe networks can sync into{' '}
          <code className="text-cyan-300">external_rx_id</code> via integration later. Payment is handled outside MEMR.
        </p>
      </div>

      <form onSubmit={submit} className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 space-y-4">
        <h2 className="text-lg font-semibold text-white">Add prescription</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-blue-200">Patient ID *</label>
            <input
              required
              value={form.patient_id}
              onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
              placeholder="e.g. 42"
            />
          </div>
          <div>
            <label className="text-sm text-blue-200">Encounter ID (optional)</label>
            <input
              value={form.encounter_id}
              onChange={(e) => setForm((f) => ({ ...f, encounter_id: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
              placeholder="Link to visit"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-blue-200">Medication *</label>
            <input
              required
              value={form.medication_name}
              onChange={(e) => setForm((f) => ({ ...f, medication_name: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="text-sm text-blue-200">Dosage</label>
            <input
              value={form.dosage}
              onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="text-sm text-blue-200">Quantity</label>
            <input
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="text-sm text-blue-200">Refills</label>
            <input
              value={form.refills}
              onChange={(e) => setForm((f) => ({ ...f, refills: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
              type="number"
              min={0}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-blue-200">Instructions (sig)</label>
            <textarea
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={2}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-blue-200">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save prescription'}
        </button>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Your prescriptions</h2>
        </div>
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message="Loading…" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-blue-200">No prescriptions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-blue-200">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Medication</th>
                  <th className="px-4 py-3">Dosage</th>
                  <th className="px-4 py-3">Enc.</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/10 text-gray-200">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : `#${r.patient_id}`}
                      <Link
                        href={`/patient-file/${r.patient_id}`}
                        className="ml-2 text-cyan-400 hover:underline text-xs"
                      >
                        File
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{r.medication_name}</td>
                    <td className="px-4 py-3">{r.dosage || '—'}</td>
                    <td className="px-4 py-3">{r.encounter_id ?? '—'}</td>
                    <td className="px-4 py-3 capitalize">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default withRoleProtection(PrescriptionsPage, {
  allowedRoles: [UserRole.DOCTOR],
  redirectTo: '/dashboard',
})
