'use client'

import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'
import { WORKFLOW_COLUMNS, type ImmigrationCaseRow, type ImmigrationWorkflowStatus } from '@/lib/immigration/types'
import {
  WORKFLOW_STATUS_BADGE,
  WORKFLOW_STATUS_DOT,
  workflowColumnForStatus,
} from '@/lib/immigration/workflow-status-ui'

type Props = {
  caseRow: ImmigrationCaseRow | null
  loading?: boolean
  className?: string
  onStatusChange?: (status: ImmigrationWorkflowStatus) => void
}

export function ImmigrationWorkflowStatusBadge({
  caseRow,
  loading = false,
  className = '',
  onStatusChange,
}: Props) {
  const { t, language } = useT()

  if (loading) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 ${className}`}
        aria-busy="true"
      >
        {t('common.loading')}
      </div>
    )
  }

  if (!caseRow) return null

  const column = workflowColumnForStatus(caseRow.status)
  const badgeClass = WORKFLOW_STATUS_BADGE[caseRow.status_color] ?? WORKFLOW_STATUS_BADGE.red
  const dotClass = WORKFLOW_STATUS_DOT[caseRow.status_color] ?? WORKFLOW_STATUS_DOT.red

  const movedByName = caseRow.status_updated_by_name?.trim() || null
  const movedAt = caseRow.status_updated_at
    ? formatClinicDateTimeForLanguage(caseRow.status_updated_at, language)
    : null

  return (
    <div
      className={`inline-flex flex-col items-end gap-0.5 shrink-0 ${className}`}
      title={movedAt ? `${t(column.labelKey)} · ${movedAt}` : t(column.labelKey)}
    >
      <div className="relative inline-flex items-center">
        <span
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold ${badgeClass}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotClass}`} aria-hidden />
          <span>{t(column.labelKey)}</span>
          {onStatusChange && (
            <svg className="w-3.5 h-3.5 opacity-60 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </span>
        {onStatusChange && (
          <select
            value={caseRow.status}
            onChange={(e) => onStatusChange(e.target.value as ImmigrationWorkflowStatus)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
            title="Change workflow status"
          >
            {WORKFLOW_COLUMNS.map((col) => (
              <option key={col.status} value={col.status}>
                {t(col.labelKey)}
              </option>
            ))}
          </select>
        )}
      </div>
      {movedByName ? (
        <p
          className="text-[11px] text-slate-500 font-normal leading-tight text-right"
          title={movedAt ?? undefined}
        >
          {t('i693.wf_moved_by', { name: movedByName })}
        </p>
      ) : null}
    </div>
  )
}
