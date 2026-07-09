'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { useAuth } from '@/lib/auth-context'
import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage, getClinicDateKey } from '@/lib/datetime/clinic-timezone'
import { RELEASE_LOGS_MANAGER_EMAIL } from '@/lib/release-logs/manager'
import { RELEASE_LOGS_UI, releaseLogCardClass, releaseLogTitleClass } from '@/lib/release-logs/ui-styles'
import type { ReleaseLogRow, ReleaseLogStatus } from '@/lib/release-logs/types'
import { LoadingSpinner } from '@/components/LoadingSpinner'

type EditState = { task: string; description: string }

const blankEdit: EditState = { task: '', description: '' }

function ReleaseLogCard({
  row,
  isManager,
  viewerMode = false,
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
  viewerMode?: boolean
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
      <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-5 shadow-sm">
        <label className="mb-1 block text-xs font-medium text-slate-600">
          {t('admin.release_logs.field_task')}
        </label>
        <input
          type="text"
          value={editState.task}
          onChange={(e) => onChangeEdit({ ...editState, task: e.target.value })}
          maxLength={200}
          className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
        />
        <label className="mb-1 block text-xs font-medium text-slate-600">
          {t('admin.release_logs.field_description')}
        </label>
        <textarea
          value={editState.description}
          onChange={(e) => onChangeEdit({ ...editState, description: e.target.value })}
          maxLength={2000}
          rows={4}
          placeholder={t('admin.release_logs.description_hint')}
          className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSaveEdit}
            disabled={saving || !editState.task.trim()}
            className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={saving}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <article className={releaseLogCardClass(viewerMode)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className={releaseLogTitleClass(viewerMode)}>{row.task}</h3>
        {!viewerMode || row.status === 'upcoming' ? (
          row.status === 'upcoming' ? (
            <span className={RELEASE_LOGS_UI.badge.upcoming}>
              {t('admin.release_logs.status_upcoming')}
            </span>
          ) : !viewerMode ? (
            <span className={RELEASE_LOGS_UI.badge.released}>
              {t('admin.release_logs.status_released')}
            </span>
          ) : null
        ) : null}
      </div>

      {bullets.length > 0 ? (
        <ul className={RELEASE_LOGS_UI.description}>
          {bullets.map((line, i) => (
            <li key={i} className={RELEASE_LOGS_UI.descriptionItem}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {isManager ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {row.status === 'upcoming' ? (
            <button
              type="button"
              onClick={onMarkReleased}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              {t('admin.release_logs.mark_released')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onMarkUpcoming}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('admin.release_logs.mark_upcoming')}
            </button>
          )}
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            {t('common.delete')}
          </button>
        </div>
      ) : null}
    </article>
  )
}

function AdminReleaseLogsPage() {
  const { user } = useAuth()
  const { t, language } = useT()
  const isManager = (user?.email ?? '').trim().toLowerCase() === RELEASE_LOGS_MANAGER_EMAIL

  const [tab, setTab] = useState<ReleaseLogStatus>('released')
  const [rows, setRows] = useState<ReleaseLogRow[]>([])
  const [counts, setCounts] = useState({ released: 0, upcoming: 0 })
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [createState, setCreateState] = useState<EditState>(blankEdit)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>(blankEdit)
  const [saving, setSaving] = useState(false)

  const fetchStatus = useCallback(async (status: ReleaseLogStatus) => {
    const res = await fetch(`/api/admin/release-logs?status=${status}`, { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || t('admin.release_logs.load_failed'))
    return (json.data ?? []) as ReleaseLogRow[]
  }, [t])

  const refreshCounts = useCallback(async () => {
    try {
      const [released, upcoming] = await Promise.all([
        fetchStatus('released'),
        fetchStatus('upcoming'),
      ])
      setCounts({ released: released.length, upcoming: upcoming.length })
    } catch {
      /* counts are non-critical */
    }
  }, [fetchStatus])

  const load = useCallback(async (status: ReleaseLogStatus) => {
    setLoading(true)
    try {
      const data = await fetchStatus(status)
      setRows(data)
      setCounts((prev) => ({ ...prev, [status]: data.length }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.release_logs.load_failed'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [fetchStatus, t])

  useEffect(() => {
    void load(tab)
  }, [tab, load])

  useEffect(() => {
    void refreshCounts()
  }, [refreshCounts])

  useEffect(() => {
    if (isManager) return
    void fetch('/api/admin/release-logs/seen', { method: 'POST', credentials: 'include' }).catch(() => {})
  }, [isManager])

  const groupedRows = useMemo(() => {
    type Group = { key: string; weekday: string; date: string; rows: ReleaseLogRow[] }
    const groups = new Map<string, Group>()
    for (const row of rows) {
      const source = tab === 'released' ? row.released_at ?? row.updated_at : row.created_at
      const key = getClinicDateKey(source)
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          weekday: formatClinicDateTimeForLanguage(source, language, {
            intl: { weekday: 'long' },
            appendCt: false,
          }),
          date: formatClinicDateTimeForLanguage(source, language, {
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

  const afterMutation = useCallback(async () => {
    await Promise.all([load(tab), refreshCounts()])
  }, [load, refreshCounts, tab])

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
      if (tab === 'upcoming') await afterMutation()
      else await refreshCounts()
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
      await afterMutation()
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
      await afterMutation()
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
      await afterMutation()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.release_logs.delete_failed'))
    }
  }

  return (
    <div
      className={`${RELEASE_LOGS_UI.layout.page} ${
        isManager ? RELEASE_LOGS_UI.layout.managerWidth : RELEASE_LOGS_UI.layout.viewerWidth
      }`}
    >
      <div className={`flex flex-col gap-4 ${isManager ? 'sm:flex-row sm:items-start sm:justify-between' : ''}`}>
        <div>
          <h1 className={isManager ? RELEASE_LOGS_UI.pageTitle.manager : RELEASE_LOGS_UI.pageTitle.viewer}>
            {t('admin.release_logs.title')}
          </h1>
          <p className={RELEASE_LOGS_UI.subtitle}>
            {isManager ? t('admin.release_logs.subtitle') : t('admin.release_logs.viewer_subtitle')}
          </p>
        </div>
        {isManager ? (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-purple-700"
          >
            {showCreate ? t('common.cancel') : t('admin.release_logs.add_item')}
          </button>
        ) : null}
      </div>

      {isManager ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setTab('released')}
            className={`rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${
              tab === 'released'
                ? 'border-purple-300 bg-white ring-2 ring-purple-200'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-3xl font-bold text-slate-900">{counts.released}</div>
            <div className="mt-1 text-sm font-medium text-emerald-700">{t('admin.release_logs.tab_whats_new')}</div>
          </button>
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${
              tab === 'upcoming'
                ? 'border-purple-300 bg-white ring-2 ring-purple-200'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-3xl font-bold text-slate-900">{counts.upcoming}</div>
            <div className="mt-1 text-sm font-medium text-amber-700">{t('admin.release_logs.tab_upcoming')}</div>
          </button>
        </div>
      ) : null}

      <div
        className={`${RELEASE_LOGS_UI.panel.shell} ${
          isManager ? RELEASE_LOGS_UI.panel.managerMaxHeight : RELEASE_LOGS_UI.panel.viewerMaxHeight
        }`}
      >
        <div
          className={`${RELEASE_LOGS_UI.panel.header} ${
            isManager ? 'justify-between' : 'justify-center sm:justify-start'
          }`}
        >
          <div
            className={`${RELEASE_LOGS_UI.tabs.list} ${
              isManager ? '' : RELEASE_LOGS_UI.tabs.listViewer
            }`}
            role="tablist"
            aria-label={t('admin.release_logs.title')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'released'}
              onClick={() => setTab('released')}
              className={`${RELEASE_LOGS_UI.tabs.button} ${
                tab === 'released' ? RELEASE_LOGS_UI.tabs.active : RELEASE_LOGS_UI.tabs.idle
              }`}
            >
              {t('admin.release_logs.tab_whats_new')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'upcoming'}
              onClick={() => setTab('upcoming')}
              className={`${RELEASE_LOGS_UI.tabs.button} ${
                tab === 'upcoming' ? RELEASE_LOGS_UI.tabs.active : RELEASE_LOGS_UI.tabs.idle
              }`}
            >
              {t('admin.release_logs.tab_upcoming')}
              {!isManager ? (
                <span
                  className={`ml-1.5 text-xs ${
                    tab === 'upcoming' ? RELEASE_LOGS_UI.tabs.countActive : RELEASE_LOGS_UI.tabs.countIdle
                  }`}
                >
                  ({counts.upcoming})
                </span>
              ) : null}
            </button>
          </div>
          {isManager ? (
            <p className="text-xs text-slate-400">
              {tab === 'released'
                ? t('admin.release_logs.grouped_by_released')
                : t('admin.release_logs.grouped_by_added')}
            </p>
          ) : null}
        </div>

        <div
          className={`${RELEASE_LOGS_UI.panel.scrollBody} ${
            !isManager ? RELEASE_LOGS_UI.panel.scrollBodyViewer : ''
          }`}
        >
          {isManager && showCreate ? (
            <form
              onSubmit={submitCreate}
              className="mb-6 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 shadow-sm"
            >
              <h2 className="mb-4 text-sm font-semibold text-purple-900">{t('admin.release_logs.add_item')}</h2>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t('admin.release_logs.field_task')}
              </label>
              <input
                type="text"
                value={createState.task}
                onChange={(e) => setCreateState({ ...createState, task: e.target.value })}
                maxLength={200}
                placeholder={t('admin.release_logs.task_hint')}
                className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t('admin.release_logs.field_description')}
              </label>
              <textarea
                value={createState.description}
                onChange={(e) => setCreateState({ ...createState, description: e.target.value })}
                maxLength={2000}
                rows={4}
                placeholder={t('admin.release_logs.description_hint')}
                className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
              <button
                type="submit"
                disabled={creating || !createState.task.trim()}
                className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {creating ? t('common.saving') : t('admin.release_logs.add_item')}
              </button>
            </form>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-20">
              <LoadingSpinner message={t('common.loading')} size="sm" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-400 ring-1 ring-purple-100">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <p className="text-sm text-slate-500">
                {tab === 'upcoming' ? t('admin.release_logs.empty_upcoming') : t('admin.release_logs.empty_released')}
              </p>
            </div>
          ) : (
            <div className={isManager ? RELEASE_LOGS_UI.layout.groupStackManager : RELEASE_LOGS_UI.layout.groupStackViewer}>
              {groupedRows.map((group) => (
                <section key={group.key}>
                  <div className={RELEASE_LOGS_UI.dateHeader.row}>
                    <h2
                      className={`${RELEASE_LOGS_UI.dateHeader.label} ${
                        isManager ? RELEASE_LOGS_UI.dateHeader.labelManager : RELEASE_LOGS_UI.dateHeader.labelViewer
                      }`}
                    >
                      <span
                        className={
                          isManager ? RELEASE_LOGS_UI.dateHeader.weekdayManager : RELEASE_LOGS_UI.dateHeader.weekdayViewer
                        }
                      >
                        {group.weekday}
                      </span>
                      <span className={RELEASE_LOGS_UI.dateHeader.date}>, {group.date}</span>
                    </h2>
                    <div className={RELEASE_LOGS_UI.dateHeader.separator} />
                  </div>
                  <div
                    className={`${RELEASE_LOGS_UI.layout.cardGrid} ${
                      isManager ? RELEASE_LOGS_UI.layout.cardGridManager : ''
                    }`}
                  >
                    {group.rows.map((row) => (
                      <ReleaseLogCard
                        key={row.id}
                        row={row}
                        isManager={isManager}
                        viewerMode={!isManager}
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
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default withRoleProtection(AdminReleaseLogsPage, { allowedRoles: [UserRole.ADMIN] })
