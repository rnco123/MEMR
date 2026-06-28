'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import type {
  SupportTicket,
  TicketMessage,
  TicketPriority,
} from '@/lib/support/types'
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TICKET_PRIORITIES,
} from '@/lib/support/types'

type View = 'list' | 'thread' | 'new'

export default function SupportPage() {
  const { user } = useAuth()
  const [view, setView] = useState<View>('list')
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null)
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)

  // New ticket
  const [newSubject, setNewSubject] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newPriority, setNewPriority] = useState<TicketPriority>('normal')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newFilePreviews, setNewFilePreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [improvingNew, setImprovingNew] = useState(false)

  // Reply
  const [replyContent, setReplyContent] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [replyFilePreviews, setReplyFilePreviews] = useState<string[]>([])
  const [sendingReply, setSendingReply] = useState(false)
  const [improvingReply, setImprovingReply] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyFileInputRef = useRef<HTMLInputElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior }), 60)
  }

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true)
    try {
      const res = await fetch('/api/support/tickets')
      if (!res.ok) throw new Error()
      const { tickets } = await res.json()
      setTickets(tickets)
    } catch {
      toast.error('Failed to load tickets')
    } finally {
      setLoadingTickets(false)
    }
  }, [])

  const loadThread = useCallback(async (ticketId: string, scroll = false) => {
    setLoadingThread(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`)
      if (!res.ok) throw new Error()
      const { ticket } = await res.json()
      setActiveTicket(ticket)
      if (scroll) scrollToBottom('instant')
    } catch {
      toast.error('Failed to load ticket')
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useEffect(() => { loadTickets() }, [loadTickets])

  // Realtime: new messages on active ticket (from admin side)
  useEffect(() => {
    if (!activeTicket) return
    const supabase = supabaseRef.current
    const channel = supabase
      .channel(`user-support-msg-${activeTicket.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_ticket_messages',
        filter: `ticket_id=eq.${activeTicket.id}`,
      }, (payload) => {
        const newMsg = payload.new as TicketMessage & { attachments?: any[] }
        setActiveTicket((prev) => {
          if (!prev) return prev
          const already = (prev.messages || []).some((m) => m.id === newMsg.id)
          if (already) return prev
          return { ...prev, messages: [...(prev.messages || []), { ...newMsg, attachments: [] }] }
        })
        scrollToBottom()
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_tickets',
        filter: `id=eq.${activeTicket.id}`,
      }, (payload) => {
        setActiveTicket((prev) =>
          prev ? { ...prev, ...(payload.new as Partial<SupportTicket>) } : prev
        )
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTicket?.id (not the object reference) is intentional: avoids resubscribing on every state update that replaces activeTicket with an equivalent object.
  }, [activeTicket?.id])

  const openThread = async (ticket: SupportTicket) => {
    setView('thread')
    setActiveTicket(null)
    await loadThread(ticket.id, true)
  }

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const arr = Array.from(incoming).slice(0, 5 - newFiles.length)
    const previews = arr.map((f) => URL.createObjectURL(f))
    setNewFiles((prev) => [...prev, ...arr])
    setNewFilePreviews((prev) => [...prev, ...previews])
  }
  const removeFile = (i: number) => {
    const preview = newFilePreviews[i]
    if (preview) URL.revokeObjectURL(preview)
    setNewFiles((prev) => prev.filter((_, idx) => idx !== i))
    setNewFilePreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const addReplyFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const arr = Array.from(incoming).slice(0, 3)
    const previews = arr.map((f) => URL.createObjectURL(f))
    setReplyFiles((prev) => [...prev, ...arr])
    setReplyFilePreviews((prev) => [...prev, ...previews])
  }
  const removeReplyFile = (i: number) => {
    const preview = replyFilePreviews[i]
    if (preview) URL.revokeObjectURL(preview)
    setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))
    setReplyFilePreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const improveText = async (
    text: string,
    setText: (v: string) => void,
    setImproving: (v: boolean) => void
  ) => {
    if (!text.trim()) return
    setImproving(true)
    try {
      const res = await fetch('/api/support/ai/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error()
      const { improved } = await res.json()
      setText(improved)
      toast.success('Text improved with AI')
    } catch {
      toast.error('Could not improve text')
    } finally {
      setImproving(false)
    }
  }

  const submitNewTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newContent.trim() || !newSubject.trim()) {
      toast.error('Please fill in subject and description')
      return
    }
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('subject', newSubject)
      form.append('content', newContent)
      form.append('priority', newPriority)
      form.append('source', 'support_page')
      form.append('page_url', window.location.href)
      newFiles.forEach((f) => form.append('files', f, f.name))

      const res = await fetch('/api/support/tickets', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success('Ticket submitted successfully')
      setNewSubject('')
      setNewContent('')
      setNewPriority('normal')
      newFilePreviews.forEach((p) => URL.revokeObjectURL(p))
      setNewFiles([])
      setNewFilePreviews([])
      await loadTickets()
      setView('list')
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyContent.trim() || !activeTicket) return
    setSendingReply(true)
    const text = replyContent
    const files = replyFiles
    setReplyContent('')
    replyFilePreviews.forEach((p) => URL.revokeObjectURL(p))
    setReplyFiles([])
    setReplyFilePreviews([])

    // Optimistic
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: TicketMessage = {
      id: optimisticId,
      ticket_id: activeTicket.id,
      sender_id: user?.id || '',
      sender_name: 'You',
      sender_role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      attachments: [],
    }
    setActiveTicket((prev) =>
      prev ? { ...prev, messages: [...(prev.messages || []), optimisticMsg] } : prev
    )
    scrollToBottom()

    try {
      const form = new FormData()
      form.append('content', text)
      files.forEach((f) => form.append('files', f, f.name))

      const res = await fetch(`/api/support/tickets/${activeTicket.id}/messages`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error()
      const { message } = await res.json()
      // Replace optimistic with real
      setActiveTicket((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: (prev.messages || []).map((m) =>
            m.id === optimisticId ? { ...message, attachments: message.attachments || [] } : m
          ),
        }
      })
    } catch {
      setActiveTicket((prev) => {
        if (!prev) return prev
        return { ...prev, messages: (prev.messages || []).filter((m) => m.id !== optimisticId) }
      })
      setReplyContent(text)
      toast.error('Failed to send reply')
    } finally {
      setSendingReply(false)
    }
  }

  const closeTicket = async () => {
    if (!activeTicket) return
    const prev = activeTicket.status
    setActiveTicket((t) => t ? { ...t, status: 'closed' } : t)
    try {
      const res = await fetch(`/api/support/tickets/${activeTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      })
      if (!res.ok) throw new Error()
      toast.success('Ticket closed')
      loadTickets()
    } catch {
      setActiveTicket((t) => t ? { ...t, status: prev } : t)
      toast.error('Failed to close ticket')
    }
  }

  const reopenTicket = async () => {
    if (!activeTicket) return
    const prev = activeTicket.status
    setActiveTicket((t) => t ? { ...t, status: 'in_progress' } : t)
    try {
      const res = await fetch(`/api/support/tickets/${activeTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      })
      if (!res.ok) throw new Error()
      toast.success('Ticket reopened')
    } catch {
      setActiveTicket((t) => t ? { ...t, status: prev } : t)
      toast.error('Failed to reopen ticket')
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  // ── New ticket ─────────────────────────────────────────────────────────────
  if (view === 'new') {
    return (
      <div className="min-h-full bg-[#f0f4ff] p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setView('list')}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">New Support Ticket</h1>
              <p className="text-sm text-slate-500">Describe your issue and our team will help you</p>
            </div>
          </div>

          <form onSubmit={submitNewTicket} className="space-y-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Subject</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Priority</label>
                <div className="flex gap-2 flex-wrap">
                  {TICKET_PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPriority(p)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                        newPriority === p
                          ? `${PRIORITY_COLORS[p]} border-current ring-2 ring-offset-1 ring-current/30`
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                <div className="relative">
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Describe the issue in detail. What happened? What did you expect?"
                    rows={5}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-10 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                    maxLength={4000}
                  />
                  <button
                    type="button"
                    onClick={() => improveText(newContent, setNewContent, setImprovingNew)}
                    disabled={improvingNew || !newContent.trim()}
                    title="Improve with AI"
                    className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 hover:bg-violet-200 disabled:opacity-40 transition-colors"
                  >
                    {improvingNew ? (
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
                <p className="mt-1 text-xs text-slate-400">Click the ✦ icon to improve text with AI</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Attachments <span className="text-slate-400 font-normal">(optional, up to 5)</span>
                </label>
                {newFilePreviews.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {newFilePreviews.map((src, i) => (
                      <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local blob: object URL preview, not a next/image-eligible remote host */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-3 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Screenshots or Files
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setView('list')}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !newSubject.trim() || !newContent.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting…
                  </>
                ) : 'Submit Ticket'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ── Thread view ────────────────────────────────────────────────────────────
  if (view === 'thread' && (activeTicket || loadingThread)) {
    const messages = activeTicket?.messages || []
    const canClose = activeTicket?.status === 'resolved'
    const isClosed = activeTicket?.status === 'closed'

    return (
      // h-full fills the dashboard main (which is flex-1 min-h-0 overflow-y-auto)
      // overflow-hidden stops this element from adding its own scroll
      <div className="flex flex-col h-full overflow-hidden bg-[#f0f4ff]">

        {/* Thread header */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex items-start gap-3">
            <button
              onClick={() => { setView('list'); loadTickets() }}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0 mt-0.5"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-slate-800 truncate">
                {activeTicket?.subject ?? '…'}
              </h2>
              {activeTicket && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[activeTicket.status]}`}>
                    {STATUS_LABELS[activeTicket.status]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[activeTicket.priority]}`}>
                    {PRIORITY_LABELS[activeTicket.priority]}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(activeTicket.created_at)}</span>
                </div>
              )}
            </div>
            {canClose && (
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={reopenTicket}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
                >
                  Not Fixed
                </button>
                <button
                  onClick={closeTicket}
                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors whitespace-nowrap"
                >
                  ✓ Verify &amp; Close
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Messages — ONLY scrollable area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-5 space-y-4">
          {loadingThread ? (
            <div className="flex items-center justify-center py-16">
              <svg className="w-6 h-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            messages.map((msg: TicketMessage) => {
              const isOwn = msg.sender_id === user?.id
              const isAdminMsg = msg.sender_role === 'admin'
              const isOptimistic = msg.id.startsWith('optimistic-')
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] sm:max-w-[70%] flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                    {!isOwn && (
                      <div className="flex items-center gap-1.5 px-1">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100">
                          <svg className="w-3 h-3 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                        </div>
                        <span className="text-xs font-medium text-slate-600">
                          {msg.sender_name || 'Support Team'}
                        </span>
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-opacity ${
                        isOwn
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : isAdminMsg
                          ? 'bg-violet-600 text-white rounded-bl-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                      } ${isOptimistic ? 'opacity-60' : 'opacity-100'}`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map((att: any) =>
                            att.file_url ? (
                              <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer" className="block">
                                {att.file_type?.startsWith('image/') ? (
                                  /* eslint-disable-next-line @next/next/no-img-element -- time-limited Supabase signed URL; not a next/image-eligible remote host */
                                  <img
                                    src={att.file_url}
                                    alt={att.file_name}
                                    className="max-h-36 max-w-[200px] rounded-lg object-cover border border-white/20"
                                  />
                                ) : (
                                  <span className="flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-xs">
                                    {att.file_name}
                                  </span>
                                )}
                              </a>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                    <span className="px-1 text-[10px] text-slate-400">{formatDate(msg.created_at)}</span>
                  </div>
                </div>
              )
            })
          )}

          {activeTicket?.status === 'resolved' && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Issue marked as resolved — please verify and close above
              </div>
            </div>
          )}

          {isClosed && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-4 py-2 text-sm text-slate-600">
                Ticket closed
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Reply composer — always pinned at bottom */}
        {!isClosed && (
          <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            {replyFilePreviews.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {replyFilePreviews.map((src, i) => (
                  <div key={i} className="relative h-14 w-14 rounded-lg overflow-hidden border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob: object URL preview, not a next/image-eligible remote host */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeReplyFile(i)}
                      className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white"
                    >
                      <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={sendReply} className="flex gap-2 items-end">
              <div className="relative flex-1">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Type your reply… (Enter to send)"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-9 text-sm placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendReply(e as any)
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => improveText(replyContent, setReplyContent, setImprovingReply)}
                  disabled={improvingReply || !replyContent.trim()}
                  title="Improve with AI"
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 hover:bg-violet-200 disabled:opacity-40 transition-colors"
                >
                  {improvingReply ? (
                    <svg className="w-3 h-3 text-violet-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  )}
                </button>
              </div>
              <input
                ref={replyFileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => addReplyFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => replyFileInputRef.current?.click()}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                title="Add image"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                type="submit"
                disabled={sendingReply || !replyContent.trim()}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {sendingReply ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-[#f0f4ff] p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Support</h1>
            <p className="mt-0.5 text-sm text-slate-500">View and manage your support requests</p>
          </div>
          <button
            onClick={() => setView('new')}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 transition-all hover:shadow-blue-500/40 hover:-translate-y-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Ticket
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => {
            const count = tickets.filter((t) => t.status === s).length
            return (
              <div key={s} className="rounded-2xl bg-white border border-slate-200 p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-slate-800">{count}</div>
                <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s]}`}>
                  {STATUS_LABELS[s]}
                </div>
              </div>
            )
          })}
        </div>

        {loadingTickets ? (
          <div className="flex items-center justify-center py-20">
            <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-700">No tickets yet</h3>
            <p className="mt-1 text-sm text-slate-500">Create a new ticket whenever you need help</p>
            <button
              onClick={() => setView('new')}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Ticket
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => openThread(ticket)}
                className="w-full rounded-2xl bg-white border border-slate-200 p-4 text-left shadow-sm hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold ${STATUS_COLORS[ticket.status]}`}>
                    {ticket.status === 'open' ? '#' :
                     ticket.status === 'in_progress' ? '⟳' :
                     ticket.status === 'resolved' ? '✓' : '✗'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                      {ticket.subject}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[ticket.status]}`}>
                        {STATUS_LABELS[ticket.status]}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                        {PRIORITY_LABELS[ticket.priority]}
                      </span>
                      {ticket.source === 'floating_button' && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-600">
                          Bug Button
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">{formatDate(ticket.created_at)}</span>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
