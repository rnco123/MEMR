'use client'

import { useEffect, useRef } from 'react'
import { useT } from '@/lib/i18n'

type Props = {
  selectedCount: number
  totalSelectableOnPage: number
  onSelectAllPage: () => void
  onClear: () => void
  actionLabel: string
  actionLoadingLabel?: string
  isLoading?: boolean
  onAction: () => void
  disabled?: boolean
  selectAllLabel?: string
}

export function FlowboardBatchActionBar({
  selectedCount,
  totalSelectableOnPage,
  onSelectAllPage,
  onClear,
  actionLabel,
  actionLoadingLabel,
  isLoading = false,
  onAction,
  disabled = false,
  selectAllLabel,
}: Props) {
  const { t } = useT()
  const selectAllRef = useRef<HTMLInputElement>(null)
  const allSelected = selectedCount > 0 && selectedCount === totalSelectableOnPage
  const someSelected = selectedCount > 0 && selectedCount < totalSelectableOnPage

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    el.indeterminate = someSelected
  }, [someSelected])

  if (selectedCount === 0 && totalSelectableOnPage === 0) return null

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
        {totalSelectableOnPage > 0 && (
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={allSelected}
              onChange={(e) => {
                if (e.target.checked) onSelectAllPage()
                else onClear()
              }}
            />
            <span className="font-medium">{selectAllLabel ?? t('flow.batch_select_page')}</span>
          </label>
        )}
        {selectedCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            {t('flow.batch_selected_count', { count: selectedCount })}
          </span>
        )}
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-blue-700 hover:text-blue-900"
          >
            {t('flow.batch_clear_selection')}
          </button>
        )}
      </div>
      {selectedCount > 0 && (
        <button
          type="button"
          disabled={disabled || isLoading}
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {isLoading ? (actionLoadingLabel ?? actionLabel) : actionLabel}
        </button>
      )}
    </div>
  )
}
