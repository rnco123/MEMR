'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { isForbiddenResponse } from '@/lib/http/api-response'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'
import {
  type PhysicalExamAuditSummary,
  type RosData,
  type ExamData,
  type RosExamData,
  type SystemStatus,
} from '@/lib/encounter/physical-examination'
import { EXAM_ROWS, ROS_ROWS, type ExamRowDef, type RosRowDef } from '@/lib/encounter/physical-examination-rows'

// ── Status toggle button ──────────────────────────────────────────────────────

function StatusBtn({
  value, current, disabled, onChange,
}: {
  value: SystemStatus
  current: SystemStatus
  disabled: boolean
  onChange: (v: SystemStatus) => void
}) {
  const active = current === value
  const colorMap: Record<NonNullable<SystemStatus>, string> = {
    N:  'bg-emerald-100 text-emerald-800 border-emerald-400 font-bold ring-1 ring-emerald-400',
    A:  'bg-red-100 text-red-800 border-red-400 font-bold ring-1 ring-red-400',
    NA: 'bg-slate-200 text-slate-600 border-slate-400 font-bold ring-1 ring-slate-400',
  }
  const baseClass = 'w-9 h-8 text-sm rounded border transition-all disabled:opacity-50 disabled:cursor-not-allowed'
  const activeClass = active ? colorMap[value!] : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600 bg-white'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(active ? null : value)}
      className={`${baseClass} ${activeClass}`}
    >
      {value}
    </button>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  encounterId: number
  encounterStatus: string
  canEdit: boolean
  onSaved?: () => void
}

// ── Main component ────────────────────────────────────────────────────────────

export function EncounterPhysicalExamPanel({
  encounterId,
  encounterStatus,
  canEdit,
  onSaved,
}: Props) {
  const { t, language } = useT()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncingChart, setSyncingChart] = useState(false)
  const [editable, setEditable] = useState(canEdit)
  const [rosExam, setRosExam] = useState<RosExamData>({})
  const [savedRosExam, setSavedRosExam] = useState<RosExamData>({})
  const [lastAudit, setLastAudit] = useState<PhysicalExamAuditSummary>(null)

  const isDirty = JSON.stringify(rosExam) !== JSON.stringify(savedRosExam)
  const locked = !editable

  const cancelChanges = () => {
    setRosExam(savedRosExam)
  }

  const formatAudit = (audit: NonNullable<PhysicalExamAuditSummary>) => {
    const when = formatClinicDateTimeForLanguage(audit.updated_at, language)
    const name = audit.editor_name || t('common.unknown')
    const roleLabel =
      audit.editor_role === 'doctor' ? t('encounter_modal.soap_role_doctor') :
      audit.editor_role === 'nurse' || audit.editor_role === 'staff' ? t('encounter_modal.soap_role_nurse') :
      audit.editor_role === 'admin' ? t('encounter_modal.soap_role_admin') :
      audit.editor_role || ''
    return t('encounter_modal.pe_last_edited', { name, role: roleLabel, when })
  }

  const loadExam = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/physical-examination`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) {
          setEditable(false)
          return
        }
        throw new Error(json.error || t('encounter_modal.pe_load_failed'))
      }
      const data = (json.ros_exam as RosExamData) ?? {}
      setRosExam(data)
      setSavedRosExam(data)
      setLastAudit((json.last_audit as PhysicalExamAuditSummary) ?? null)
      setEditable(Boolean(json.editable) && canEdit)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.pe_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [encounterId, canEdit, t])

  useEffect(() => { void loadExam() }, [loadExam, encounterStatus])

  const clearFindings = (
    map: Record<string, string[]> | undefined,
    key: string
  ): Record<string, string[]> | undefined => {
    if (!map || !(key in map)) return map
    const next = { ...map }
    delete next[key]
    return Object.keys(next).length ? next : undefined
  }

  const setRosStatus = (key: keyof RosData, value: SystemStatus) => {
    setRosExam(prev => {
      const ros = { ...prev.ros, [key]: value }
      const ros_findings =
        value === 'N' || value === null ? clearFindings(prev.ros_findings, key as string) : prev.ros_findings
      return { ...prev, ros, ros_findings }
    })
  }

  const setExamStatus = (key: keyof ExamData, value: SystemStatus) => {
    setRosExam(prev => {
      const exam = { ...prev.exam, [key]: value }
      const exam_findings =
        value === 'N' || value === null ? clearFindings(prev.exam_findings, key as string) : prev.exam_findings
      return { ...prev, exam, exam_findings }
    })
  }

  const toggleFinding = (section: 'ros' | 'exam', rowKey: string, label: string) => {
    setRosExam(prev => {
      const mapKey = section === 'ros' ? 'ros_findings' : 'exam_findings'
      const current = { ...(prev[mapKey] ?? {}) }
      const selected = current[rowKey] ?? []
      const next = selected.includes(label)
        ? selected.filter(l => l !== label)
        : [...selected, label]

      if (next.length === 0) delete current[rowKey]
      else current[rowKey] = next

      const nextMap = Object.keys(current).length ? current : undefined
      const anyAbnormal = next.length > 0

      if (section === 'ros') {
        const ros = { ...prev.ros }
        if (anyAbnormal) ros[rowKey as keyof RosData] = 'A' as never
        else if (ros[rowKey as keyof RosData] === 'A') ros[rowKey as keyof RosData] = null as never
        return { ...prev, ros, ros_findings: nextMap }
      }

      const exam = { ...prev.exam }
      if (anyAbnormal) exam[rowKey as keyof ExamData] = 'A' as never
      else if (exam[rowKey as keyof ExamData] === 'A') exam[rowKey as keyof ExamData] = null as never
      return { ...prev, exam, exam_findings: nextMap }
    })
  }

  const setRosText = (key: keyof RosData, value: string) => {
    setRosExam(prev => ({ ...prev, ros: { ...prev.ros, [key]: value || null } }))
  }

  const setExamText = (key: keyof ExamData, value: string) => {
    setRosExam(prev => ({ ...prev, exam: { ...prev.exam, [key]: value || null } }))
  }

  const setAllRos = (value: SystemStatus) => {
    setRosExam(prev => {
      const ros = { ...prev.ros }
      for (const row of ROS_ROWS) ros[row.key] = value
      const ros_findings = value === 'N' || value === null ? undefined : prev.ros_findings
      return { ...prev, ros, ros_findings }
    })
  }

  const setAllExam = (value: SystemStatus) => {
    setRosExam(prev => {
      const exam = { ...prev.exam }
      for (const row of EXAM_ROWS) exam[row.key] = value
      const exam_findings = value === 'N' || value === null ? undefined : prev.exam_findings
      return { ...prev, exam, exam_findings }
    })
  }

  const setRemarks = (value: string) => {
    setRosExam(prev => ({ ...prev, remarks: value || null }))
  }

  const save = async () => {
    if (locked || !isDirty) return
    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/physical-examination`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ physical_examination: {}, ros_exam: rosExam }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        throw new Error(json.error || t('encounter_modal.toast_save_failed'))
      }
      const data = (json.ros_exam as RosExamData) ?? rosExam
      setRosExam(data)
      setSavedRosExam(data)
      setLastAudit((json.last_audit as PhysicalExamAuditSummary) ?? null)
      setEditable(Boolean(json.editable) && canEdit)
      toast.success(t('encounter_modal.toast_saved'))
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.toast_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const syncPatientChart = async () => {
    setSyncingChart(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/physical-examination/sync-chart`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        const message =
          res.status === 400
            ? t('encounter_modal.pe_sync_chart_no_data')
            : json.error || t('encounter_modal.pe_sync_chart_failed')
        throw new Error(message)
      }

      const action = json.action as string | undefined
      if (action === 'created') {
        toast.success(t('encounter_modal.pe_sync_chart_created'))
      } else if (action === 'updated') {
        toast.success(t('encounter_modal.pe_sync_chart_updated'))
      } else if (action === 'removed') {
        toast.message(t('encounter_modal.pe_sync_chart_removed'))
      } else {
        toast.success(t('encounter_modal.pe_sync_chart_updated'))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.pe_sync_chart_failed'))
    } finally {
      setSyncingChart(false)
    }
  }

  const renderBulkActions = (onAll: (value: SystemStatus) => void) => (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={locked || saving}
        onClick={() => onAll('N')}
        className="px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {t('encounter_modal.pe_all_normal')}
      </button>
      <button
        type="button"
        disabled={locked || saving}
        onClick={() => onAll('A')}
        className="px-2.5 py-1 rounded border border-red-300 bg-red-50 text-red-800 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {t('encounter_modal.pe_all_abnormal')}
      </button>
    </div>
  )

  // ── Row renderers ────────────────────────────────────────────────────────

  const renderFindingsCapsules = (
    section: 'ros' | 'exam',
    rowKey: string,
    findings: RosRowDef['findings']
  ) => {
    if (!findings.length) return null
    const selected =
      (section === 'ros' ? rosExam.ros_findings?.[rowKey] : rosExam.exam_findings?.[rowKey]) ?? []

    return (
      <div className="flex flex-wrap gap-1">
        {findings.map(finding => {
          const active = selected.includes(finding.label)
          return (
            <button
              key={finding.label}
              type="button"
              disabled={locked || saving}
              onClick={() => toggleFinding(section, rowKey, finding.label)}
              className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                active
                  ? 'bg-red-100 text-red-800 border-red-400 ring-1 ring-red-400'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
              }`}
            >
              {finding.label}
            </button>
          )
        })}
      </div>
    )
  }

  const renderRosRow = (row: RosRowDef) => {
    const status = (rosExam.ros?.[row.key] ?? null) as SystemStatus
    return (
      <tr key={row.key} className="border-b border-slate-100 last:border-0">
        <td className="py-2 pr-3 text-sm font-semibold text-slate-800 whitespace-nowrap w-[100px] align-top">{row.label}</td>
        <td className="py-2 pr-1.5 w-10 text-center align-top">
          <StatusBtn value="N" current={status} disabled={locked || saving} onChange={v => setRosStatus(row.key, v)} />
        </td>
        <td className="py-2 pr-2 w-10 text-center align-top">
          <StatusBtn value="A" current={status} disabled={locked || saving} onChange={v => setRosStatus(row.key, v)} />
        </td>
        <td className="py-2">
          {renderFindingsCapsules('ros', row.key, row.findings)}
          {row.extras?.map(ex => (
            <input
              key={String(ex.key)}
              type="text"
              placeholder={ex.placeholder}
              disabled={locked || saving}
              value={(rosExam.ros?.[ex.key] as string | null | undefined) ?? ''}
              onChange={e => setRosText(ex.key, e.target.value)}
              className="mt-1.5 w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#2E6EF3] disabled:opacity-50"
            />
          ))}
        </td>
      </tr>
    )
  }

  const renderExamRow = (row: ExamRowDef) => {
    const status = (rosExam.exam?.[row.key] ?? null) as SystemStatus
    return (
      <tr key={row.key} className="border-b border-slate-100 last:border-0">
        <td className="py-2 pr-3 text-sm font-semibold text-slate-800 whitespace-nowrap w-[100px] align-top">{row.label}</td>
        <td className="py-2 pr-1.5 w-10 text-center align-top">
          <StatusBtn value="N" current={status} disabled={locked || saving} onChange={v => setExamStatus(row.key, v)} />
        </td>
        <td className="py-2 pr-2 w-10 text-center align-top">
          <StatusBtn value="A" current={status} disabled={locked || saving} onChange={v => setExamStatus(row.key, v)} />
        </td>
        <td className="py-2">
          {renderFindingsCapsules('exam', row.key, row.findings)}
          {row.extras?.map(ex => (
            <input
              key={String(ex.key)}
              type="text"
              placeholder={ex.placeholder}
              disabled={locked || saving}
              value={(rosExam.exam?.[ex.key] as string | null | undefined) ?? ''}
              onChange={e => setExamText(ex.key, e.target.value)}
              className="mt-1.5 w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#2E6EF3] disabled:opacity-50"
            />
          ))}
        </td>
      </tr>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{t('encounter_modal.pe_title')}</h3>
          {lastAudit && (
            <p className="text-xs text-violet-700 mt-2 font-medium">{formatAudit(lastAudit)}</p>
          )}
          <p className="text-sm text-slate-500 mt-1">{t('encounter_modal.pe_subtitle')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('encounter_modal.pe_all_optional')}</p>
        </div>
        {!loading ? (
          <button
            type="button"
            disabled={saving || syncingChart}
            onClick={() => void syncPatientChart()}
            title={t('encounter_modal.pe_sync_chart_hint')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-[#2E6EF3]/40 hover:text-[#2E6EF3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {syncingChart ? t('encounter_modal.pe_sync_chart_running') : t('encounter_modal.pe_sync_chart')}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><LoadingSpinner /></div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-7 h-6 rounded border border-emerald-400 bg-emerald-100 text-emerald-800 font-bold text-xs">N</span>
              Normal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-7 h-6 rounded border border-red-400 bg-red-100 text-red-800 font-bold text-xs">A</span>
              Abnormal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-red-400 bg-red-100 text-red-800 font-medium text-xs">Finding</span>
              Click a finding to mark it abnormal
            </span>
            <span className="text-slate-400 text-xs">(click again to deselect)</span>
          </div>

          {/* Two-column ROS / EXAM tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* ROS */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">ROS</span>
                  {!locked && renderBulkActions(setAllRos)}
                </div>
                <div className="flex items-center">
                  <span className="text-sm font-bold text-slate-700 uppercase tracking-wide flex-1" aria-hidden />
                  <span className="w-10 text-center text-xs font-semibold text-slate-500">N</span>
                  <span className="w-10 text-center text-xs font-semibold text-slate-500 mr-2">A</span>
                  <span className="text-xs font-semibold text-slate-500 flex-1">Findings</span>
                </div>
              </div>
              <div className="px-4 py-1">
                <table className="w-full">
                  <tbody>
                    {ROS_ROWS.map(row => renderRosRow(row))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* EXAM */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">EXAM</span>
                  {!locked && renderBulkActions(setAllExam)}
                </div>
                <div className="flex items-center">
                  <span className="text-sm font-bold text-slate-700 uppercase tracking-wide flex-1" aria-hidden />
                  <span className="w-10 text-center text-xs font-semibold text-slate-500">N</span>
                  <span className="w-10 text-center text-xs font-semibold text-slate-500 mr-2">A</span>
                  <span className="text-xs font-semibold text-slate-500 flex-1">Findings</span>
                </div>
              </div>
              <div className="px-4 py-1">
                <table className="w-full">
                  <tbody>
                    {EXAM_ROWS.map(row => renderExamRow(row))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              {t('encounter_modal.pe_remarks')}
            </label>
            <textarea
              rows={3}
              value={rosExam.remarks ?? ''}
              disabled={locked || saving}
              onChange={e => setRemarks(e.target.value)}
              className="w-full bg-[#f9fbff] border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/35 focus:border-[#2E6EF3] disabled:opacity-50 disabled:bg-slate-50 resize-y min-h-[72px] [color-scheme:light]"
              placeholder="Additional remarks…"
            />
          </div>

          {/* Save / Cancel — only when there are unsaved changes */}
          {!locked && isDirty ? (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={cancelChanges}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="px-4 py-2 bg-[#2E6EF3] text-white rounded-xl text-sm font-semibold hover:bg-[#256ae8] transition-colors disabled:opacity-50"
              >
                {saving ? t('encounter_modal.pe_saving') : t('encounter_modal.pe_save')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
