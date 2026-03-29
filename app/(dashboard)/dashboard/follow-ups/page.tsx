'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'

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
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Post-visit follow-up</h1>
        <p className="text-blue-200/90 text-sm">
          Reminders, lab/Rx review, callbacks, escalations. Automated monitoring can be layered on later.
        </p>
      </div>

      <form onSubmit={createTask} className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 space-y-4">
        <h2 className="text-lg font-semibold text-white">New task</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-blue-200">Patient ID *</label>
            <input
              required
              value={form.patient_id}
              onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="text-sm text-blue-200">Encounter ID</label>
            <input
              value={form.encounter_id}
              onChange={(e) => setForm((f) => ({ ...f, encounter_id: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="text-sm text-blue-200">Type</label>
            <select
              value={form.task_type}
              onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value as Task['task_type'] }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            >
              <option value="follow_up_reminder">Follow-up reminder</option>
              <option value="lab_review">Lab review</option>
              <option value="rx_review">Prescription review</option>
              <option value="escalation">Escalation</option>
              <option value="callback">Callback</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-blue-200">Due</label>
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-blue-200">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
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
          {submitting ? 'Saving…' : 'Create task'}
        </button>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Tasks</h2>
        </div>
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message="Loading…" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="p-8 text-blue-200">No tasks yet.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {tasks.map((t) => (
              <div key={t.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <p className="text-white font-medium">{t.title}</p>
                  <p className="text-xs text-blue-300 capitalize">
                    {t.task_type.replace('_', ' ')} · Patient #{t.patient_id}
                    {t.encounter_id ? ` · Enc ${t.encounter_id}` : ''}
                  </p>
                  {t.due_at && (
                    <p className="text-xs text-amber-200/90 mt-1">Due {new Date(t.due_at).toLocaleString()}</p>
                  )}
                  {t.notes && <p className="text-sm text-gray-300 mt-2">{t.notes}</p>}
                  <Link href={`/patient-file/${t.patient_id}`} className="text-xs text-cyan-400 hover:underline mt-1 inline-block">
                    Open patient file
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase text-gray-400">{t.status.replace('_', ' ')}</span>
                  {t.status !== 'done' && t.status !== 'cancelled' && (
                    <>
                      <button
                        type="button"
                        className="text-xs px-3 py-1 rounded-lg bg-white/10 text-white"
                        onClick={() => updateStatus(t.id, 'in_progress')}
                      >
                        In progress
                      </button>
                      <button
                        type="button"
                        className="text-xs px-3 py-1 rounded-lg bg-green-500/30 text-green-200"
                        onClick={() => updateStatus(t.id, 'done')}
                      >
                        Done
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
  allowedRoles: [UserRole.DOCTOR, UserRole.NURSE, UserRole.STAFF],
  redirectTo: '/dashboard',
})
