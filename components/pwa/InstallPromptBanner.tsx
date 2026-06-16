'use client'

import { useEffect, useState } from 'react'
import { useInstallPrompt, useIsStandalone } from '@/lib/hooks/use-pwa'
import { useIsMobile } from '@/lib/hooks/use-media-query'

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Android/i.test(ua)
  return isIos && isSafari
}

/**
 * Appears once on mobile when the app is installable (Android/Chrome).
 * Respects "already installed" and standalone mode.
 * iOS users see the native prompt hint instead.
 */
export function InstallPromptBanner() {
  const { canInstall, promptInstall } = useInstallPrompt()
  const isStandalone = useIsStandalone()
  const isMobile = useIsMobile()
  const [dismissed, setDismissed] = useState(false)
  const [iosHintOpen, setIosHintOpen] = useState(false)

  useEffect(() => {
    if (!isMobile || isStandalone || dismissed || canInstall) return
    if (!isIosSafari()) return
    const timer = window.setTimeout(() => setIosHintOpen(true), 2500)
    return () => window.clearTimeout(timer)
  }, [isMobile, isStandalone, dismissed, canInstall])

  if (!isMobile || isStandalone || dismissed) return null

  if (canInstall) {
    return (
      <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom)+0.5rem)] left-3 right-3 z-50 rounded-2xl border border-[#2E6EF3]/20 bg-white p-4 shadow-xl animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2E6EF3]">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Install MyclinicMD</p>
            <p className="text-xs text-slate-500 mt-0.5">Add to your home screen for the full app experience.</p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={async () => { await promptInstall(); setDismissed(true) }}
                className="rounded-lg bg-[#2E6EF3] px-3.5 py-1.5 text-xs font-semibold text-white"
              >
                Install
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-slate-500"
              >
                Not now
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="p-1 text-slate-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // iOS: no programmatic prompt — show hint instead after a short delay.
  // We show a small hint tap target in case user explicitly triggers it.
  return (
    <>
      {iosHintOpen && (
        <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom)+0.5rem)] left-3 right-3 z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
              <svg className="h-5 w-5 text-slate-600" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 2L8 6h3v6h2V6h3L12 2zm-7 14v4h14v-4H5z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">Add to Home Screen</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Tap the <strong>Share</strong> button <span aria-hidden>⬆️</span> in Safari then choose <strong>Add to Home Screen</strong>.
              </p>
            </div>
            <button type="button" onClick={() => { setIosHintOpen(false); setDismissed(true) }} aria-label="Close" className="p-1 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
