'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMediaQuery, MEDIA_QUERIES } from '@/lib/hooks/use-media-query'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** True when the app is running as an installed PWA (standalone display mode). */
export function useIsStandalone(): boolean {
  const standalone = useMediaQuery(MEDIA_QUERIES.standalone)
  const [iosStandalone, setIosStandalone] = useState(false)

  useEffect(() => {
    // iOS Safari exposes navigator.standalone instead of display-mode media query.
    const nav = window.navigator as Navigator & { standalone?: boolean }
    setIosStandalone(Boolean(nav.standalone))
  }, [])

  return standalone || iosStandalone
}

/**
 * Install-prompt handling for Android/Chromium. Captures `beforeinstallprompt`
 * so the app can surface its own install affordance. iOS has no programmatic
 * prompt (users add via the Share sheet), so `canInstall` stays false there.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    return choice.outcome === 'accepted'
  }, [deferred])

  return { canInstall: Boolean(deferred), installed, promptInstall }
}
