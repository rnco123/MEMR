'use client'

import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmDialog } from '@/components/ConfirmDialog'

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
}

/**
 * Promise-based replacement for `window.confirm` using the app ConfirmDialog.
 * `if (!(await confirm({ title, message }))) return` — render `confirmDialog` once in the component.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current?.(false)
        resolverRef.current = resolve
        setOptions(opts)
      }),
    []
  )

  const settle = (ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setOptions(null)
  }

  const dialog = (
    <ConfirmDialog
      open={options != null}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
      title={options?.title ?? ''}
      message={options?.message ?? ''}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
    />
  )

  // Portal: inside some app shells a fixed overlay doesn't cover the top of the screen.
  const confirmDialog = typeof document === 'undefined' ? dialog : createPortal(dialog, document.body)

  return { confirm, confirmDialog }
}
