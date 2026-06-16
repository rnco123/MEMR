'use client'

import { useEffect } from 'react'

/**
 * Registers the PWA service worker in production only.
 * Dev is skipped so HMR and uncached assets behave normally.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration failures are non-fatal */
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
