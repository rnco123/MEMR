'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { useAuth } from '@/lib/auth-context'
import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage, getClinicDateKey } from '@/lib/datetime/clinic-timezone'
import { RELEASE_LOGS_MANAGER_EMAIL } from '@/lib/release-logs/auth'
import type { ReleaseLogRow, ReleaseLogStatus } from '@/lib/release-logs/types'

type EditState = { task: string; description: string }

const blankEdit: EditState = { task: '', description: '' }

function ReleaseLogCard({
  row,
  isManager,
  isEditing,
  editState,
  saving,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSaveEdit,
  onMarkReleased,
  onMarkUpcoming,
  onDelete,
}: {
  row: ReleaseLogRow
  isManager: boolean
  isEditing: boolean
  editState: EditState
  saving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onChangeEdit: (next: EditState) => void
  onSaveEdit: () => void
  onMarkReleased: () => void
  onMarkUpcoming: () => void
  onDelete: () => void
}) {
  const { t } = useT()
  const bullets = row.description
    ? row.description.split('\n').map((line) => line.trim()).filter(Boolean)
    : []

  if (isEditing) {
    return (
      <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {t('admin.release_logs.field_task')}
        </label>
        <input
          type="text"
          value={editState.task}
          onChange={(e) => onChangeEdit({ ...editState, task: e.target.value })}
          maxLength={200}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
        />
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {t('admin.release_logs.field_description')}
        </label>
        <textarea
          value={editState.description}
          onChange={(e) => onChangeEdit({ ...editState, description: e.target.value })}
          maxLength={2000}
          rows={4}
          placeholder={t('admin.release_logs.description_hint')}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSaveEdit}
            disabled={saving || !editState.task.trim()}
            className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-slate-900">{row.task}</h3>
        {row.status === 'upcoming' ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {t('admin.release_logs.status_upcoming')}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            {t('admin.release_logs.status_released')}
          </span>
        )}
      </div>

      {bullets.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {bullets.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      {isManager && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {row.status === 'upcoming' ? (
            <button
              type="button"
              onClick={onMarkReleased}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            >
              {t('admin.release_logs.mark_released')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onMarkUpcoming}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('admin.release_logs.mark_upcoming')}
            </button>
          )}
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  )
}

function AdminReleaseLogsPage() {
  const { user } = useAuth()
  const { t, language } = useT()
  const isManager = (user?.email ?? '').trim().toLowerCase() === RELEASE_LOGS_MANAGER_EMAIL

  const [tab, setTab] = useState<ReleaseLogStatus>('released')
  const [rows, setRows] = useState<ReleaseLogRow[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [createState, setCreateState] = useState<EditState>(blankEdit)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>(blankEdit)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (status: ReleaseLogStatus) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/release-logs?status=${status}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.release_logs.load_failed'))
      setRows((json.data ?? []) as ReleaseLogRow[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.release_logs.load_failed'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load(tab)
  }, [tab, load])

  // Clear the sidebar "new activity" dot for non-manager admins once they've opened this page.
  useEffect(() => {
    if (isManager) return
    void fetch('/api/admin/release-logs/seen', { method: 'POST', credentials: 'include' }).catch(() => {})
  }, [isManager])

  // Group by clinic-local calendar day (not time): Upcoming groups by when the item was
  // added; What's New groups by when it was moved to released.
  const groupedRows = useMemo(() => {
    type Group = { key: string; label: string; rows: ReleaseLogRow[] }
    const groups = new Map<string, Group>()
    for (const row of rows) {
      const source = tab === 'released' ? row.released_at ?? row.updated_at : row.created_at
      const key = getClinicDateKey(source)
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          label: formatClinicDateTimeForLanguage(source, language, {
            intl: { year: 'numeric', month: 'long', day: 'numeric' },
            appendCt: false,
          }),
          rows: [],
        }
        groups.set(key, group)
      }
      group.rows.push(row)
    }
    return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
  }, [rows, tab, language])

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createState.task.trim()) {
      toast.error(t('admin.release_logs.validation_required'))
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/release-logs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: createState.task.trim(),
          description: createState.description.trim() || null,
          status: 'upcoming',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.release_logs.save_failed'))
      toast.success(t('admin.release_logs.created'))
      setShowCreate(false)
      setCreateState(blankEdit)
      if (tab === 'upcoming') await load('upcoming')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.release_logs.save_failed'))
    } finally {
      setCreating(false)
    }
  }

  const patchRow = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/release-logs/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || t('admin.release_logs.save_failed'))
    return json
  }

  const startEdit = (row: ReleaseLogRow) => {
    setEditingId(row.id)
    setEditState({ task: row.task, description: row.description ?? '' })
  }

  const submitEdit = async () => {
    if (!editingId || !editState.task.trim()) return
    setSaving(true)
    try {
      await patchRow(editingId, {
        task: editState.task.trim(),
        description: editState.description.trim() || null,
      })
      toast.success(t('admin.release_logs.saved'))
      setEditingId(null)
      await load(tab)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.release_logs.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (row: ReleaseLogRow, status: ReleaseLogStatus) => {
    try {
      await patchRow(row.id, { status })
      toast.success(
        status === 'released' ? t('admin.release_logs.marked_released') : t('admin.release_logs.marked_upcoming')
      )
      await load(tab)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.release_logs.save_failed'))
    }
  }

  const deleteRow = async (row: ReleaseLogRow) => {
    if (!window.confirm(t('admin.release_logs.delete_confirm', { task: row.task }))) return
    try {
      const res = await fetch(`/api/admin/release-logs/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.release_logs.delete_failed'))
      toast.success(t('admin.release_logs.deleted'))
      await load(tab)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.release_logs.delete_failed'))
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t('admin.release_logs.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.release_logs.subtitle')}</p>
      </div>

      <div className="mb-5 flex items-center justify-between">
        <div
          className="inline-flex h-11 p-1 rounded-xl bg-slate-100 border border-slate-200"
          role="tablist"
          aria-label={t('admin.release_logs.title')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'released'}
            onClick={() => setTab('released')}
            className={`inline-flex items-center px-4 rounded-lg text-sm font-medium transition-all ${
              tab === 'released' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('admin.release_logs.tab_whats_new')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upcoming'}
            onClick={() => setTab('upcoming')}
            className={`inline-flex items-center px-4 rounded-lg text-sm font-medium transition-all ${
              tab === 'upcoming' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('admin.release_logs.tab_upcoming')}
          </button>
        </div>

        {isManager && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            {showCreate ? t('common.cancel') : t('admin.release_logs.add_item')}
          </button>
        )}
      </div>

      {isManager && showCreate && (
        <form onSubmit={submitCreate} className="mb-5 rounded-xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t('admin.release_logs.field_task')}
          </label>
          <input
            type="text"
            value={createState.task}
            onChange={(e) => setCreateState({ ...createState, task: e.target.value })}
            maxLength={200}
            placeholder={t('admin.release_logs.task_hint')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
          />
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t('admin.release_logs.field_description')}
          </label>
          <textarea
            value={createState.description}
            onChange={(e) => setCreateState({ ...createState, description: e.target.value })}
            maxLength={2000}
            rows={4}
            placeholder={t('admin.release_logs.description_hint')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
          />
          <button
            type="submit"
            disabled={creating || !createState.task.trim()}
            className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {creating ? t('common.saving') : t('admin.release_logs.add_item')}
          </button>
        </form>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">
          {tab === 'upcoming' ? t('admin.release_logs.empty_upcoming') : t('admin.release_logs.empty_released')}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedRows.map((group) => (
            <div key={group.key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {group.label}
              </h2>
              <div className="space-y-3">
                {group.rows.map((row) => (
                  <ReleaseLogCard
                    key={row.id}
                    row={row}
                    isManager={isManager}
                    isEditing={editingId === row.id}
                    editState={editState}
                    saving={saving}
                    onStartEdit={() => startEdit(row)}
                    onCancelEdit={() => setEditingId(null)}
                    onChangeEdit={setEditState}
                    onSaveEdit={submitEdit}
                    onMarkReleased={() => setStatus(row, 'released')}
                    onMarkUpcoming={() => setStatus(row, 'upcoming')}
                    onDelete={() => deleteRow(row)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default withRoleProtection(AdminReleaseLogsPage, { allowedRoles: [UserRole.ADMIN] })
