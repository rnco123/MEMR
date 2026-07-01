'use client'

import { useT } from '@/lib/i18n'

export const ENCOUNTER_SECTION_EDIT_BUTTON_CLASS =
  'px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-50'

type Props = {
  onClick: () => void
  label?: string
  disabled?: boolean
}

export function EncounterSectionEditButton({ onClick, label, disabled }: Props) {
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={ENCOUNTER_SECTION_EDIT_BUTTON_CLASS}
    >
      {label ?? t('common.edit')}
    </button>
  )
}
