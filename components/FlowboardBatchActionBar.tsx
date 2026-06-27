'use client'

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
}: Props) {
  const { t } = useT()

  if (selectedCount === 0 && totalSelectableOnPage === 0) return null

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2E6EF3]/25 bg-[#2E6EF3]/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
        {totalSelectableOnPage > 0 && (
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-[#2E6EF3] focus:ring-[#2E6EF3]"
              checked={selectedCount > 0 && selectedCount === totalSelectableOnPage}
              onChange={(e) => {
                if (e.target.checked) onSelectAllPage()
                else onClear()
              }}
            />
            <span>{t('flow.batch_select_page')}</span>
          </label>
        )}
        {selectedCount > 0 && (
          <span className="font-medium">
            {t('flow.batch_selected_count', { count: selectedCount })}
          </span>
        )}
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-[#2E6EF3] hover:text-[#1f5ad2]"
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
          className="inline-flex items-center gap-2 rounded-lg bg-[#2E6EF3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1f5ad2] disabled:opacity-50 transition-colors"
        >
          {isLoading ? (actionLoadingLabel ?? actionLabel) : actionLabel}
        </button>
      )}
    </div>
  )
}
