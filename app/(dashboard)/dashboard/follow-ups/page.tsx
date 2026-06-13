'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

type Task = {
  id: number
  encounter_id: number | null
  patient_id: number
  task_type: string
  title: string
  due_at: string | null
  status: string
  notes: string | null
  created_at: string
}

function FollowUpsPage() {
  const { t, language } = useT()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    patient_id: '',
    encounter_id: '',
    task_type: 'follow_up_reminder' as Task['task_type'],
    title: '',
    due_at: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/post-visit-tasks?status=all', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setTasks(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const patient_id = Number(form.patient_id)
      if (!Number.isFinite(patient_id)) {
        toast.error('Patient ID required')
        return
      }
      const encounter_id = form.encounter_id.trim() ? Number(form.encounter_id) : null
      if (form.encounter_id.trim() && !Number.isFinite(encounter_id)) {
        toast.error('Invalid encounter ID')
        return
      }
      const res = await fetch('/api/post-visit-tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id,
          encounter_id,
          task_type: form.task_type,
          title: form.title.trim(),
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          notes: form.notes.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success('Task created')
      setForm({
        patient_id: '',
        encounter_id: '',
        task_type: 'follow_up_reminder',
        title: '',
        due_at: '',
        notes: '',
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (id: number, status: Task['status']) => {
    try {
      const res = await fetch(`/api/post-visit-tasks/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success('Updated')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('followups.title')}</h1>
        <p className="text-slate-500 text-sm">
          {t('followups.subtitle')}
        </p>
      </div>

      <form onSubmit={createTask} className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">{t('followups.new_task')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('followups.patient_id')} *</label>
            <input
              required
              value={form.patient_id}
              onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('followups.encounter_id')}</label>
            <input
              value={form.encounter_id}
              onChange={(e) => setForm((f) => ({ ...f, encounter_id: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('followups.type')}</label>
            <select
              value={form.task_type}
              onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value as Task['task_type'] }))}
              className="mt-1 w-full h-10 bg-white border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            >
              <option value="follow_up_reminder">{t('followups.t_followup')}</option>
              <option value="lab_review">{t('followups.t_lab')}</option>
              <option value="rx_review">{t('followups.t_rx')}</option>
              <option value="escalation">{t('followups.t_escalation')}</option>
              <option value="callback">{t('followups.t_callback')}</option>
              <option value="other">{t('followups.t_other')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('followups.due')}</label>
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">{t('followups.title_field')} *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">{t('followups.notes')}</label>
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
          {submitting ? t('common.saving') : t('followups.create')}
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{t('followups.tasks')}</h2>
        </div>
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message={t('followups.loading')} />
          </div>
        ) : tasks.length === 0 ? (
          <p className="p-8 text-slate-500 text-sm">{t('followups.empty')}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <div key={task.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="flex-1">
                  <p className="text-slate-900 font-semibold text-sm">{task.title}</p>
                  <p className="text-xs text-slate-500 capitalize mt-0.5">
                    {task.task_type.replace('_', ' ')} · Patient #{task.patient_id}
                    {task.encounter_id ? ` · Enc ${task.encounter_id}` : ''}
                  </p>
                  {task.due_at && (
                    <p className="text-xs text-amber-600 mt-1 font-medium">{t('followups.due_at', { date: formatClinicDateTimeForLanguage(task.due_at, language) })}</p>
                  )}
                  {task.notes && <p className="text-sm text-slate-600 mt-2">{task.notes}</p>}
                  <Link href={`/patient-file/${task.patient_id}`} className="text-xs text-[#2E6EF3] hover:text-[#1f5ad2] font-medium mt-1.5 inline-block">
                    {t('followups.open_file')}
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold capitalize px-2.5 py-1 rounded-full border ${
                    task.status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : task.status === 'cancelled' ? 'bg-slate-50 text-slate-500 border-slate-200'
                    : task.status === 'in_progress' ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-[#2E6EF3]/10 text-[#2E6EF3] border-[#2E6EF3]/20'
                  }`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  {task.status !== 'done' && task.status !== 'cancelled' && (
                    <>
                      <button
                        type="button"
                        className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                        onClick={() => updateStatus(task.id, 'in_progress')}
                      >
                        {t('common.in_progress')}
                      </button>
                      <button
                        type="button"
                        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        onClick={() => updateStatus(task.id, 'done')}
                      >
                        {t('common.done')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default withRoleProtection(FollowUpsPage, {
  allowedRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE],
  redirectTo: '/dashboard',
})
