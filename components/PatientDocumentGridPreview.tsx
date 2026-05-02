'use client'

import { useState } from 'react'

const ICON_IMAGE =
  'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
const ICON_PDF =
  'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z'
const ICON_GENERIC =
  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'

function pdfEmbedSrc(url: string): string {
  const base = url.includes('#') ? url.split('#')[0]! : url
  return `${base}#toolbar=0&navpanes=0&scrollbar=0`
}

function iconForType(fileType: string): { d: string; color: string } {
  if (fileType.startsWith('image/')) return { d: ICON_IMAGE, color: 'text-blue-400' }
  if (fileType === 'application/pdf') return { d: ICON_PDF, color: 'text-red-400' }
  return { d: ICON_GENERIC, color: 'text-gray-400' }
}

export interface PatientDocumentGridPreviewProps {
  fileUrl: string | null | undefined
  fileType: string | null | undefined
  documentName: string
}

/**
 * Drive-style tile preview: image thumbnails and PDF first-page via embedded viewer.
 * Falls back to a large type icon when there is no URL, image load fails, or type is not previewable.
 */
export function PatientDocumentGridPreview({
  fileUrl,
  fileType,
  documentName,
}: PatientDocumentGridPreviewProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const ft = fileType || ''
  const url = (fileUrl || '').trim()

  const fallback = (
    <div className="flex h-full min-h-[148px] w-full flex-col items-center justify-center gap-2 bg-slate-800/95 px-4">
      {(() => {
        const { d, color } = iconForType(ft)
        return (
          <svg className={`h-14 w-14 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} />
          </svg>
        )
      })()}
      <span className="line-clamp-2 text-center text-[11px] text-slate-400">{documentName}</span>
    </div>
  )

  if (!url) {
    return fallback
  }

  if (ft.startsWith('image/')) {
    if (imgFailed) return fallback
    return (
      // Signed storage URLs; next/image would need every host in next.config
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={documentName}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => setImgFailed(true)}
      />
    )
  }

  if (ft === 'application/pdf') {
    return (
      <iframe
        title={documentName}
        src={pdfEmbedSrc(url)}
        className="pointer-events-none h-full min-h-[160px] w-full border-0 bg-[#e8e8ea]"
      />
    )
  }

  return fallback
}
