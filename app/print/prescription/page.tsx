'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { buildUsPrescriptionPdfBlob } from '@/lib/prescriptions/us-prescription-pdf'
import type { PrescriptionPrintContext } from '@/lib/prescriptions/load-prescription-print-context'

const PRESCRIPTION_PRINT_STORAGE_PREFIX = 'prescription-print:'

function scheduleRevokeObjectUrl(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

export default function PrescriptionPrintPage() {
  const searchParams = useSearchParams()
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const key = searchParams.get('key')?.trim()
    if (!key?.startsWith(PRESCRIPTION_PRINT_STORAGE_PREFIX)) {
      window.close()
      return
    }

    const raw = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    if (!raw) {
      window.close()
      return
    }

    let ctx: PrescriptionPrintContext
    try {
      ctx = JSON.parse(raw) as PrescriptionPrintContext
    } catch {
      window.close()
      return
    }

    void (async () => {
      try {
        const blob = await buildUsPrescriptionPdfBlob(ctx)
        const blobUrl = URL.createObjectURL(blob)
        scheduleRevokeObjectUrl(blobUrl)

        const iframe = document.createElement('iframe')
        iframe.setAttribute('title', 'Prescription print')
        iframe.style.cssText =
          'position:fixed;width:0;height:0;border:0;clip:rect(0,0,0,0);overflow:hidden'
        iframe.src = blobUrl
        document.body.appendChild(iframe)

        iframe.addEventListener(
          'load',
          () => {
            window.setTimeout(() => {
              try {
                iframe.contentWindow?.focus()
                iframe.contentWindow?.print()
              } catch {
                /* user can print manually */
              }
            }, 400)
          },
          { once: true }
        )
      } catch {
        window.close()
      }
    })()
  }, [searchParams])

  return null
}
