'use client'

import { useT } from '@/lib/i18n'

interface UnderDevelopmentModalProps {
  isOpen: boolean
  onClose: () => void
  titleKey?: 'flow.final_review_dev_title'
  messageKey?: 'flow.final_review_dev_message'
}

export function UnderDevelopmentModal({
  isOpen,
  onClose,
  titleKey = 'flow.final_review_dev_title',
  messageKey = 'flow.final_review_dev_message',
}: UnderDevelopmentModalProps) {
  const { t } = useT()

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="under-development-title"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-300/40 max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h3 id="under-development-title" className="text-xl font-semibold text-slate-900 tracking-tight">
            {t(titleKey)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/50"
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-slate-600 text-sm leading-relaxed">{t(messageKey)}</p>
        </div>

        <div className="px-6 pb-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#2E6EF3] text-white rounded-xl text-sm font-semibold hover:bg-[#2559c9] transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
