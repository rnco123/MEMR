'use client'

import { useT } from '@/lib/i18n'

export default function OfflinePage() {
  const { t } = useT()

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-[#bfdbfe] via-[#eef2ff] to-[#f8fafc] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] px-5">
      <div className="flex items-center justify-center gap-2 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-[0.625rem] bg-[#2E6EF3]">
          <svg className="h-[1.125rem] w-[1.125rem] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
        </div>
        <span className="text-[0.9375rem] font-bold tracking-tight text-slate-800">MyclinicMD</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center max-w-sm w-full mx-auto text-center">
        <div className="w-full rounded-[1.75rem] bg-white px-6 py-8 shadow-[0_20px_50px_rgba(15,23,42,0.1)]">
          <div className="relative mx-auto mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-blue-50 to-blue-100">
            <svg className="h-8 w-8 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
            <span className="pointer-events-none absolute h-0.5 w-11 rotate-[-45deg] rounded-full bg-red-500 shadow-[0_0_0_2px_white]" aria-hidden />
          </div>

          <h1 className="text-[1.375rem] font-bold tracking-tight text-slate-900">{t('offline.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('offline.description')}</p>

          <ul className="mt-5 space-y-2 rounded-[0.875rem] border border-slate-200 bg-slate-50 px-4 py-3.5 text-left text-[0.8125rem] leading-snug text-slate-600">
            <li className="flex gap-2">
              <span className="font-bold text-[#2E6EF3]">•</span>
              {t('offline.tip_wifi')}
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-[#2E6EF3]">•</span>
              {t('offline.tip_signal')}
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-[#2E6EF3]">•</span>
              {t('offline.tip_secure')}
            </li>
          </ul>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-[#2E6EF3] text-sm font-semibold text-white shadow-[0_8px_24px_rgba(46,110,243,0.35)] transition-colors hover:bg-[#1f5ad2] active:bg-[#1a4db8]"
          >
            {t('offline.retry')}
          </button>
        </div>

        <p className="mt-5 text-xs text-slate-400">
          {t('offline.still_stuck')}{' '}
          <a
            href="mailto:admin@myclinicmd.com?subject=Connection%20issue"
            className="font-semibold text-[#2E6EF3] hover:underline"
          >
            admin@myclinicmd.com
          </a>
        </p>
      </div>
    </div>
  )
}
