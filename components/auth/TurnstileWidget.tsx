'use client'

import Script from 'next/script'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

export type TurnstileWidgetRef = {
  reset: () => void
}

type TurnstileWidgetProps = {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
}

/** Cloudflare Turnstile widget (explicit render — gives us a reset() for retry after a failed login). */
export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, onVerify, onExpire }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const [scriptLoaded, setScriptLoaded] = useState(false)

    // Keep latest callbacks in refs so the widget never holds a stale closure without needing to re-render.
    const onVerifyRef = useRef(onVerify)
    onVerifyRef.current = onVerify
    const onExpireRef = useRef(onExpire)
    onExpireRef.current = onExpire

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current)
        }
      },
    }))

    useEffect(() => {
      if (!scriptLoaded || !containerRef.current || !window.turnstile) return

      const id = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onVerifyRef.current(token),
        'expired-callback': () => onExpireRef.current?.(),
      })
      widgetIdRef.current = id

      return () => {
        if (window.turnstile && id) window.turnstile.remove(id)
      }
    }, [scriptLoaded, siteKey])

    return (
      <>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          async
          defer
          onLoad={() => setScriptLoaded(true)}
        />
        <div ref={containerRef} />
      </>
    )
  }
)
