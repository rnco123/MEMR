'use client'

import { useEffect, useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useT } from '@/lib/i18n'

type Props = {
  url: string
  title: string
}

/**
 * Word (.docx) preview.
 *
 * The file is fetched from its signed URL and converted to HTML in the browser by
 * mammoth. Rendering client-side is deliberate: the hosted Office and Google viewers
 * need a publicly fetchable URL and would put patient documents through a third party,
 * which is not acceptable for PHI. Mammoth keeps the bytes in the page.
 *
 * Mammoth maps Word styles onto plain HTML, so formatting is approximate — headings,
 * lists, tables and emphasis survive; exact page layout does not. Staff who need the
 * original still have the download button.
 */
export function PatientDocxViewer({ url, title }: Props) {
  const { t } = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    setLoading(true)
    setError(null)
    host.innerHTML = ''

    const render = async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return

        // Loaded on demand so mammoth stays out of the initial bundle.
        const mammoth = await import('mammoth/mammoth.browser')
        const { value } = await mammoth.convertToHtml({ arrayBuffer })
        if (cancelled || !hostRef.current) return

        // mammoth emits a fixed, script-free subset of HTML from the document's own
        // styles, and images arrive as data: URIs.
        hostRef.current.innerHTML = value || ''
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="relative flex h-full w-full justify-center overflow-auto bg-slate-100 p-4">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoadingSpinner message={t('patient_file.loading_document')} variant="dark" size="sm" />
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <p className="font-medium text-slate-700">{t('patient_file.docx_preview_failed')}</p>
          <a
            href={url}
            download={title}
            className="rounded-lg bg-[#2E6EF3] px-4 py-2 text-white transition-all hover:bg-[#1f5ad2]"
          >
            {t('patient_file.open_new_tab')}
          </a>
        </div>
      )}

      <div
        ref={hostRef}
        aria-label={title}
        className={`docx-preview w-full max-w-3xl rounded-lg bg-white px-10 py-12 shadow-lg ${
          loading || error ? 'invisible' : ''
        }`}
      />
    </div>
  )
}
