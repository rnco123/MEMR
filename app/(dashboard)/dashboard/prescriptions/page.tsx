'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { PHYSICIAN_OR_ADMIN_ROLES } from '@/lib/roles'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

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
  const PAGE_SIZE = 20
  const { t, language } = useT()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      const patientName = r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : ''
      return `${r.id} ${r.patient_id} ${patientName} ${r.medication_name} ${r.dosage ?? ''} ${r.external_rx_id ?? ''}`
        .toLowerCase()
        .includes(q)
    })
  }, [rows, search, statusFilter])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, page])

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('rx.title')}</h1>
        <p className="text-slate-500 text-sm max-w-2xl">
          {t('rx.subtitle_part1')}{' '}
          <code className="text-[#2E6EF3] bg-[#2E6EF3]/10 px-1.5 py-0.5 rounded text-xs">external_rx_id</code> {t('rx.subtitle_part2')}
        </p>
      </div>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">{t('rx.add')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('followups.patient_id')} *</label>
            <input
              required
              value={form.patient_id}
              onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
              placeholder="e.g. 42"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('followups.encounter_id')} ({t('common.optional')})</label>
            <input
              value={form.encounter_id}
              onChange={(e) => setForm((f) => ({ ...f, encounter_id: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
              placeholder={t('rx.encounter_placeholder')}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">{t('rx.medication')} *</label>
            <input
              required
              value={form.medication_name}
              onChange={(e) => setForm((f) => ({ ...f, medication_name: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('rx.dosage')}</label>
            <input
              value={form.dosage}
              onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('rx.quantity')}</label>
            <input
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('rx.refills')}</label>
            <input
              value={form.refills}
              onChange={(e) => setForm((f) => ({ ...f, refills: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
              type="number"
              min={0}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">{t('rx.instructions')}</label>
            <textarea
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={2}
              className="mt-1 w-full bg-[#f9fbff] border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">{t('rx.notes')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="mt-1 w-full bg-[#f9fbff] border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 h-10 rounded-lg bg-[#2E6EF3] hover:bg-[#1f5ad2] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {submitting ? t('common.saving') : t('rx.save')}
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-3">{t('rx.your_rx')}</h2>
          <div className="flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, medication, id..."
              className="h-9 min-w-[220px] flex-1 border border-slate-200 rounded-lg px-3 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 border border-slate-200 rounded-lg px-2.5 text-sm"
            >
              <option value="all">All statuses</option>
              {Array.from(new Set(rows.map((r) => r.status))).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message={t('rx.loading')} />
          </div>
        ) : filteredRows.length === 0 ? (
          <p className="p-8 text-slate-500 text-sm">{t('rx.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('rx.col_date')}</th>
                  <th className="px-4 py-3 font-semibold">{t('rx.col_patient')}</th>
                  <th className="px-4 py-3 font-semibold">{t('rx.col_medication')}</th>
                  <th className="px-4 py-3 font-semibold">{t('rx.col_dosage')}</th>
                  <th className="px-4 py-3 font-semibold">{t('rx.col_enc')}</th>
                  <th className="px-4 py-3 font-semibold">{t('rx.col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 text-slate-700 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">{formatClinicDateTimeForLanguage(r.created_at, language)}</td>
                    <td className="px-4 py-3">
                      {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : `#${r.patient_id}`}
                      <Link
                        href={`/patient-file/${r.patient_id}`}
                        className="ml-2 text-[#2E6EF3] hover:text-[#1f5ad2] text-xs font-semibold"
                      >
                        {t('rx.file')}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{r.medication_name}</td>
                    <td className="px-4 py-3">{r.dosage || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{r.encounter_id ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize bg-[#2E6EF3]/10 text-[#2E6EF3] border border-[#2E6EF3]/20">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!loading && filteredRows.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-3 py-1.5 text-slate-600">Page {page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(PrescriptionsPage, {
  allowedRoles: [...PHYSICIAN_OR_ADMIN_ROLES],
  redirectTo: '/dashboard',
})
