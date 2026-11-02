'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

type LocationQr = { locationid: number; locationtitle: string; qrcode: string | null }
type QrResponse = { portal_location_id: number | null; data: LocationQr | null; error?: string }

/**
 * Patient check-in QR for one location: view, generate (via mcm-bridge, which adds the
 * portal Qr row), download and print. `endpoint` is the admin or clinic-manager QR route.
 */
export function LocationQrDialog({
  endpoint,
  locationTitle,
  onClose,
}: {
  endpoint: string
  locationTitle: string
  onClose: () => void
}) {
  const { t } = useT()
  const [result, setResult] = useState<QrResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(endpoint, { credentials: 'include' })
      const json = (await res.json().catch(() => ({}))) as QrResponse
      if (!res.ok) throw new Error(json.error || t('locations.qr.error'))
      setResult(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('locations.qr.error'))
    } finally {
      setLoading(false)
    }
  }, [endpoint, t])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(endpoint, { method: 'POST', credentials: 'include' })
      const json = (await res.json().catch(() => ({}))) as QrResponse
      if (!res.ok) throw new Error(json.error || t('locations.qr.error'))
      setResult(json)
      toast.success(t('locations.qr.generated'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('locations.qr.error'))
    } finally {
      setGenerating(false)
    }
  }

  const qr = result?.data?.qrcode ? result.data : null
  const title = qr?.locationtitle || locationTitle
  const fileName = `qr-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`

  const download = async () => {
    if (!qr?.qrcode) return
    try {
      const blob = await (await fetch(qr.qrcode)).blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      window.open(qr.qrcode, '_blank', 'noopener')
    }
  }

  const print = () => {
    if (!qr?.qrcode) return
    const w = window.open('', '_blank', 'width=600,height=760')
    if (!w) return
    const doc = w.document
    doc.title = title
    const wrap = doc.createElement('div')
    wrap.style.cssText = 'font-family:system-ui,sans-serif;text-align:center;padding:32px'
    const h = doc.createElement('h2')
    h.textContent = title
    const p = doc.createElement('p')
    p.textContent = t('locations.qr.scan_hint')
    const img = doc.createElement('img')
    img.src = qr.qrcode
    img.style.cssText = 'width:420px;max-width:100%'
    img.onload = () => {
      w.focus()
      w.print()
    }
    wrap.append(h, p, img)
    doc.body.appendChild(wrap)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-qr-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="location-qr-title" className="text-lg font-semibold text-slate-900">{t('locations.qr.title')}</h2>
            <p className="truncate text-sm text-slate-500">{title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {loading ? (
            <span className="text-sm text-slate-400">{t('common.loading')}</span>
          ) : qr?.qrcode ? (
            // eslint-disable-next-line @next/next/no-img-element -- public storage URL shown and printed as-is
            <img src={qr.qrcode} alt={t('locations.qr.alt', { location: title })} className="h-full w-full object-contain p-3" />
          ) : (
            <p className="px-6 text-center text-sm text-slate-500">
              {result?.portal_location_id == null ? t('locations.qr.not_synced') : t('locations.qr.none')}
            </p>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">{t('locations.qr.scan_hint')}</p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {qr?.qrcode ? (
            <>
              <button type="button" onClick={download}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('locations.qr.download')}
              </button>
              <button type="button" onClick={print}
                className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">
                {t('locations.qr.print')}
              </button>
            </>
          ) : (
            !loading && result && (
              <button type="button" onClick={generate} disabled={generating}
                className="h-10 rounded-lg bg-[#2E6EF3] px-4 text-sm font-semibold text-white hover:bg-[#1f5ad2] disabled:opacity-60">
                {generating ? t('locations.qr.generating') : t('locations.qr.generate')}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
