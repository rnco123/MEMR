'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'
import type {
  SupportTicket,
  TicketMessage,
  TicketPriority,
  TicketStatus,
} from '@/lib/support/types'
import {
  PRIORITY_COLORS,
  STATUS_COLORS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '@/lib/support/types'

type View = 'list' | 'thread'

export default function AdminSupportPage() {
  const { user } = useAuth()
  const { t } = useT()
  const statusLabel = (s: TicketStatus) => t(`support.status.${s}`)
  const priorityLabel = (p: TicketPriority) => t(`support.priority.${p}`)
  const [view, setView] = useState<View>('list')
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null)
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [filterStatus, setFilterStatus] = useState<TicketStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<TicketPriority | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [replyContent, setReplyContent] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [improvingReply, setImprovingReply] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const threadEndRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior }), 60)
  }

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterPriority !== 'all') params.set('priority', filterPriority)
      const res = await fetch(`/api/support/tickets?${params}`)
      if (!res.ok) throw new Error()
      const { tickets } = await res.json()
      setTickets(tickets)
    } catch {
      toast.error(t('support.load_failed'))
    } finally {
      setLoadingTickets(false)
    }
  }, [filterStatus, filterPriority])

  const loadThread = useCallback(async (ticketId: string, scroll = false) => {
    setLoadingThread(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`)
      if (!res.ok) throw new Error()
      const { ticket } = await res.json()
      setActiveTicket(ticket)
      if (scroll) scrollToBottom('instant')
    } catch {
      toast.error(t('support.thread_load_failed'))
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useEffect(() => { loadTickets() }, [loadTickets])

  // Realtime: new messages on active ticket
  useEffect(() => {
    if (!activeTicket) return
    const supabase = supabaseRef.current
    const channel = supabase
      .channel(`admin-support-msg-${activeTicket.id}`)
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

  // Realtime: new tickets only (INSERT); list refresh relies on admin RLS
  useEffect(() => {
    const supabase = supabaseRef.current
    const channel = supabase
      .channel('admin-support-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, () => {
        loadTickets()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadTickets])

  const openThread = async (ticket: SupportTicket) => {
    setView('thread')
    setActiveTicket(null)
    await loadThread(ticket.id, true)
  }

  // Update status locally + API — no thread reload
  const updateStatus = async (status: TicketStatus) => {
    if (!activeTicket) return
    setUpdatingStatus(true)
    const prev = activeTicket.status
    // Optimistic
    setActiveTicket((t) => t ? { ...t, status } : t)
    try {
      const res = await fetch(`/api/support/tickets/${activeTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('support.status_updated', { status: statusLabel(status) }))
      loadTickets()
    } catch {
      setActiveTicket((t) => t ? { ...t, status: prev } : t)
      toast.error(t('support.status_update_failed'))
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Update priority locally + API — no thread reload
  const updatePriority = async (priority: TicketPriority) => {
    if (!activeTicket) return
    const prev = activeTicket.priority
    setActiveTicket((t) => t ? { ...t, priority } : t)
    try {
      const res = await fetch(`/api/support/tickets/${activeTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('support.priority_updated', { priority: priorityLabel(priority) }))
    } catch {
      setActiveTicket((t) => t ? { ...t, priority: prev } : t)
      toast.error(t('support.priority_update_failed'))
    }
  }

  const improveText = async () => {
    if (!replyContent.trim()) return
    setImprovingReply(true)
    try {
      const res = await fetch('/api/support/ai/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyContent }),
      })
      if (!res.ok) throw new Error()
      const { improved } = await res.json()
      setReplyContent(improved)
      toast.success('Text improved with AI')
    } catch {
      toast.error('Could not improve text')
    } finally {
      setImprovingReply(false)
    }
  }

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyContent.trim() || !activeTicket) return
    setSendingReply(true)
    const text = replyContent
    setReplyContent('')

    // Optimistic: add message immediately
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: TicketMessage = {
      id: optimisticId,
      ticket_id: activeTicket.id,
      sender_id: user?.id || '',
      sender_name: 'Support Team',
      sender_role: 'admin',
      content: text,
      created_at: new Date().toISOString(),
      attachments: [],
    }
    setActiveTicket((prev) =>
      prev ? { ...prev, messages: [...(prev.messages || []), optimisticMsg] } : prev
    )
    scrollToBottom()

    try {
      const res = await fetch(`/api/support/tickets/${activeTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      if (!res.ok) throw new Error()
      const { message } = await res.json()
      // Replace optimistic with real
      setActiveTicket((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: (prev.messages || []).map((m) =>
            m.id === optimisticId ? { ...message, attachments: [] } : m
          ),
        }
      })
    } catch {
      // Rollback optimistic
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

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  const filteredTickets = tickets.filter((t) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      t.subject.toLowerCase().includes(q) ||
      (t.created_by_name || '').toLowerCase().includes(q) ||
      (t.created_by_email || '').toLowerCase().includes(q)
    )
  })

  const statusCounts = TICKET_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = tickets.filter((t) => t.status === s).length
    return acc
  }, {})

  // ── Thread view ────────────────────────────────────────────────────────────
  if (view === 'thread' && (activeTicket || loadingThread)) {
    const messages = activeTicket?.messages || []
    const isClosed = activeTicket?.status === 'closed'

    return (
      <div className="flex flex-col h-full overflow-hidden bg-[#f6f2ff]">

        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 sm:px-5">
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
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{activeTicket.created_by_name || 'Unknown'}</span>
                  <span>·</span>
                  <span>{activeTicket.created_by_email}</span>
                  <span>·</span>
                  <span className="capitalize">{activeTicket.created_by_role}</span>
                  {activeTicket.source === 'floating_button' && (
                    <>
                      <span>·</span>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600 font-medium">Bug Button</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {activeTicket && (
            <>
              {/* Status row */}
              <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-slate-400 mr-0.5">{t('support.status_label')}</span>
                {TICKET_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(s)}
                    disabled={updatingStatus || activeTicket.status === s}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-all ${
                      activeTicket.status === s
                        ? `${STATUS_COLORS[s]} border-current`
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 disabled:opacity-40'
                    }`}
                  >
                    {statusLabel(s)}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-slate-400 hidden sm:flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                  {activeTicket.device_type} · {activeTicket.browser} · {activeTicket.os}
                </span>
              </div>
              {/* Priority row */}
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-400 mr-0.5">{t('support.priority_label')}</span>
                {TICKET_PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => updatePriority(p)}
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-medium border transition-all ${
                      activeTicket.priority === p
                        ? `${PRIORITY_COLORS[p]} border-current`
                        : 'border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {priorityLabel(p)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Page URL bar */}
        {activeTicket?.page_url && (
          <div className="flex-shrink-0 bg-amber-50 border-b border-amber-100 px-4 py-1.5 text-xs text-amber-700 truncate">
            <span className="font-medium">Page:</span> {activeTicket.page_url}
          </div>
        )}

        {/* Messages — this is the ONLY scrollable area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-5 space-y-4">
          {loadingThread ? (
            <div className="flex items-center justify-center py-16">
              <svg className="w-6 h-6 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            messages.map((msg: TicketMessage) => {
              const isAdminMsg = msg.sender_role === 'admin'
              const isOptimistic = msg.id.startsWith('optimistic-')
              return (
                <div key={msg.id} className={`flex ${isAdminMsg ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] sm:max-w-[70%] flex flex-col gap-1 ${isAdminMsg ? 'items-end' : 'items-start'}`}>
                    {!isAdminMsg && (
                      <div className="flex items-center gap-1.5 px-1">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                          <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <span className="text-xs font-medium text-slate-600">
                          {msg.sender_name || 'User'}{' '}
                          <span className="text-slate-400 font-normal capitalize">({msg.sender_role})</span>
                        </span>
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-opacity ${
                      isAdminMsg
                        ? 'bg-violet-600 text-white rounded-br-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                    } ${isOptimistic ? 'opacity-60' : 'opacity-100'}`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map((att: any) =>
                            att.file_url ? (
                              <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer">
                                {att.file_type?.startsWith('image/') ? (
                                  <div className="relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- time-limited Supabase signed URL; not a next/image-eligible remote host */}
                                    <img
                                      src={att.file_url}
                                      alt={att.file_name}
                                      className="max-h-40 max-w-[220px] rounded-lg object-cover border border-white/20"
                                    />
                                    {att.is_screenshot && (
                                      <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                        Screenshot
                                      </span>
                                    )}
                                  </div>
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

          {isClosed && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-4 py-2 text-sm text-slate-600">
                Ticket closed by user
              </div>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Reply composer — always pinned at bottom */}
        {!isClosed && (
          <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <form onSubmit={sendReply} className="flex gap-3 items-end">
              {/* AI Correct button — left of textarea */}
              <button
                type="button"
                onClick={improveText}
                disabled={improvingReply || !replyContent.trim()}
                title="AI Correct"
                className="relative flex-shrink-0 flex flex-col items-center justify-center gap-1 h-[4.5rem] w-14 rounded-xl bg-violet-50 border border-violet-200 hover:bg-violet-100 disabled:opacity-40 transition-colors group"
              >
                {improvingReply ? (
                  <svg className="w-5 h-5 text-violet-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                )}
                <span className="text-[9px] font-semibold text-violet-600 leading-none">
                  {improvingReply ? 'Working…' : 'AI Correct'}
                </span>
              </button>

              <div className="flex-1">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Reply to this ticket… (Enter to send, Shift+Enter for newline)"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm placeholder-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendReply(e as any)
                    }
                  }}
                />
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0">
                {activeTicket && activeTicket.status !== 'resolved' && activeTicket.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => updateStatus('resolved')}
                    disabled={updatingStatus}
                    className="flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Resolved
                  </button>
                )}
                <button
                  type="submit"
                  disabled={sendingReply || !replyContent.trim()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors px-5 py-2.5 text-sm font-semibold shadow-md shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5 active:translate-y-0"
                >
                  {sendingReply ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('support.admin_title')}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t('support.admin_subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TICKET_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
            className={`rounded-2xl border p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 ${
              filterStatus === s
                ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-200'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-2xl font-bold text-slate-800">{statusCounts[s] || 0}</div>
            <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s]}`}>
              {statusLabel(s)}
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('support.search_placeholder')}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all"
          />
        </div>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as any)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all"
        >
          <option value="all">{t('support.all_priorities')}</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>{priorityLabel(p)}</option>
          ))}
        </select>
        {(filterStatus !== 'all' || filterPriority !== 'all' || searchQuery) && (
          <button
            onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setSearchQuery('') }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
          >
            {t('common.clear_filters')}
          </button>
        )}
      </div>

      {/* Ticket list */}
      {loadingTickets ? (
        <div className="flex items-center justify-center py-20">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-700">{t('support.no_tickets')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('support.no_tickets_hint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => openThread(ticket)}
              className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3.5 text-left shadow-sm hover:border-violet-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  ticket.priority === 'urgent' ? 'bg-red-500' :
                  ticket.priority === 'high' ? 'bg-orange-500' :
                  ticket.priority === 'normal' ? 'bg-blue-400' : 'bg-slate-300'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800 group-hover:text-violet-700 transition-colors truncate">
                      {ticket.subject}
                    </p>
                    <span className="flex-shrink-0 text-xs text-slate-400">{formatDate(ticket.created_at)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[ticket.status]}`}>
                      {statusLabel(ticket.status)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                      {priorityLabel(ticket.priority)}
                    </span>
                    {ticket.source === 'floating_button' && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-600">
                        {t('support.bug_button')}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {ticket.created_by_name || t('common.unknown')}{ticket.created_by_role ? ` · ${ticket.created_by_role}` : ''}
                    </span>
                    {ticket.device_type && (
                      <span className="text-[10px] text-slate-400 capitalize">
                        · {ticket.device_type} · {ticket.browser}
                      </span>
                    )}
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-violet-400 transition-colors flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
