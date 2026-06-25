'use client'

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { usePathname } from 'next/navigation'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function BugReportModal({ isOpen, onClose }: Props) {
  const pathname = usePathname()
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isImproving, setIsImproving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const captureScreen = useCallback(async () => {
    setIsCapturing(true)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as MediaTrackConstraints,
        audio: false,
      })

      const track = stream.getVideoTracks()[0]
      // Use ImageCapture API if available, fallback to video element
      let blob: Blob | null = null

      if (typeof (window as any).ImageCapture !== 'undefined') {
        try {
          const imageCapture = new (window as any).ImageCapture(track)
          blob = await imageCapture.grabFrame().then((bitmap: ImageBitmap) => {
            const canvas = document.createElement('canvas')
            canvas.width = bitmap.width
            canvas.height = bitmap.height
            const ctx = canvas.getContext('2d')
            ctx?.drawImage(bitmap, 0, 0)
            return new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
          })
        } catch {
          blob = null
        }
      }

      if (!blob) {
        // Fallback: render one frame via video element
        await new Promise<void>((resolve) => {
          const video = document.createElement('video')
          video.srcObject = stream
          video.onloadedmetadata = () => {
            video.play()
            video.onseeked = null
            setTimeout(async () => {
              const canvas = document.createElement('canvas')
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
              const ctx = canvas.getContext('2d')
              ctx?.drawImage(video, 0, 0)
              blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
              resolve()
            }, 200)
          }
        })
      }

      // Stop all tracks
      stream.getTracks().forEach((t) => t.stop())

      if (blob) {
        const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
        setScreenshot(file)
        setScreenshotPreview(URL.createObjectURL(blob))
        toast.success('Screenshot captured')
      }
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        toast.error('Could not capture screenshot')
      }
    } finally {
      setIsCapturing(false)
    }
  }, [])

  const removeScreenshot = () => {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview)
    setScreenshot(null)
    setScreenshotPreview(null)
  }

  const improveText = async () => {
    if (!description.trim()) return
    setIsImproving(true)
    try {
      const res = await fetch('/api/support/ai/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: description }),
      })
      if (!res.ok) throw new Error()
      const { improved } = await res.json()
      setDescription(improved)
      toast.success('Text improved')
    } catch {
      toast.error('Could not improve text')
    } finally {
      setIsImproving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      toast.error('Please describe the issue')
      return
    }
    setIsSubmitting(true)
    try {
      const form = new FormData()
      form.append('subject', description.substring(0, 80).trim() + (description.length > 80 ? '...' : ''))
      form.append('content', description)
      form.append('priority', 'normal')
      form.append('source', 'floating_button')
      form.append('page_url', window.location.href)
      if (screenshot) form.append('files', screenshot, screenshot.name)

      const res = await fetch('/api/support/tickets', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success('Bug report submitted! We\'ll look into it.')
      handleClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit report')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    removeScreenshot()
    setDescription('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center"
      onClick={handleClose}
    >
      {/* Subtle backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      <div
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">Report a Bug</h3>
            <p className="text-xs text-slate-400 truncate">{pathname}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Description */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened..."
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all pr-9"
              maxLength={4000}
            />
            {/* AI improve button */}
            <button
              type="button"
              onClick={improveText}
              disabled={isImproving || !description.trim()}
              title="Improve with AI"
              className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 hover:bg-violet-200 disabled:opacity-40 transition-colors"
            >
              {isImproving ? (
                <svg className="w-3.5 h-3.5 text-violet-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 -mt-1">Click the ✦ icon to improve with AI</p>

          {/* Screenshot section */}
          {screenshotPreview ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200">
              <img src={screenshotPreview} alt="Screenshot" className="w-full max-h-32 object-cover" />
              <button
                type="button"
                onClick={removeScreenshot}
                className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={captureScreen}
              disabled={isCapturing}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-2.5 text-xs text-slate-500 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-50 transition-all"
            >
              {isCapturing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Capturing...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Capture Screenshot (optional)
                </>
              )}
            </button>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !description.trim()}
              className="flex-1 rounded-xl bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </>
              ) : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
