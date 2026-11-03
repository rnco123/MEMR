'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from './LoadingSpinner'
import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage, formatClinicChatTime } from '@/lib/datetime/clinic-timezone'
import { useUserProfile } from '@/lib/hooks/use-user-profile'
import { resolveDisplayName } from '@/lib/display-name'

interface User {
  uid: string
  full_name: string | null
  role: string
  email: string | null
}

interface Conversation {
  id: string
  participant1_id: string
  participant2_id: string
  last_message_at: string
  other_participant: {
    id: string
    full_name: string
    role: string
    email: string | null
  }
}

interface ChatAttachment {
  id: string
  message_id: string
  file_name: string
  file_type: string
  file_size: number
  file_url: string | null
}

interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  read_at: string | null
  created_at: string
  sender: {
    id: string
    full_name: string
    role: string
  }
  attachments?: ChatAttachment[]
}

const CHAT_FILE_ACCEPT = '.png,.jpg,.jpeg,.pdf,.doc,.docx,image/png,image/jpeg,application/pdf'
const CHAT_MAX_FILE_BYTES = 10 * 1024 * 1024
const ATTACHMENT_PLACEHOLDER = '📎 Attachment'

function formatChatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isAttachmentOnlyContent(content: string | undefined, hasAttachments: boolean): boolean {
  if (!hasAttachments) return false
  const t = (content || '').trim()
  return !t || t === ATTACHMENT_PLACEHOLDER
}

function ChatAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-9 w-9 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-14 w-14 text-base',
  }
  const initial = (name || '?').charAt(0).toUpperCase()
  return (
    <div
      className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 font-semibold text-white shadow-sm ring-2 ring-white`}
    >
      {initial}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const r = (role || '').toLowerCase()
  if (r === 'admin') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200/80">
        Admin
      </span>
    )
  }
  if (r === 'doctor' || r === 'fnp' || r === 'pa') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200/80">
        Doctor
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200/80 capitalize">
      {role}
    </span>
  )
}

function ChatMessageAttachments({
  attachments,
  downloadLabel,
  isOwn = false,
}: {
  attachments: ChatAttachment[]
  downloadLabel: string
  isOwn?: boolean
}) {
  if (!attachments.length) return null

  return (
    <div className="mt-1.5 space-y-2">
      {attachments.map((att) => {
        const isImage = att.file_type?.startsWith('image/')
        return (
          <div
            key={att.id}
            className={`overflow-hidden rounded-2xl shadow-sm ${
              isOwn ? 'border border-violet-100 bg-violet-50 text-slate-800' : 'bg-violet-600/90 text-white'
            }`}
          >
            {isImage && att.file_url ? (
              <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.file_url}
                  alt={att.file_name}
                  className="max-h-48 max-w-full bg-violet-950/20 object-contain"
                />
              </a>
            ) : null}
            <div className={`flex items-center gap-2 px-3 py-2.5 ${isImage ? (isOwn ? 'border-t border-violet-100' : 'border-t border-white/15') : ''}`}>
              <svg className={`h-5 w-5 shrink-0 ${isOwn ? 'text-violet-500' : 'text-white/80'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{att.file_name}</p>
                <p className={`text-[11px] ${isOwn ? 'text-slate-500' : 'text-white/70'}`}>{formatChatFileSize(att.file_size)}</p>
              </div>
              {att.file_url && (
                <a
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isOwn ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-white/15 hover:bg-white/25'
                  }`}
                  title={downloadLabel}
                  aria-label={downloadLabel}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface ChatProps {
  isOpen: boolean
  onClose: () => void
}

export function Chat({ isOpen, onClose }: ChatProps) {
  const { user } = useAuth()
  const { t, language } = useT()
  const { profile } = useUserProfile()
  const supabase = createClient()
  const [activeView, setActiveView] = useState<'conversations' | 'new-chat'>('conversations')
  const [searchQuery, setSearchQuery] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return
    
    try {
      const response = await fetch('/api/chat/conversations', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // Fetch users for new chat
  const fetchUsers = useCallback(async () => {
    if (!user) return
    
    try {
      const response = await fetch('/api/chat/users', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      } else {
        const errorData = await response.json()
        console.error('Error fetching users:', errorData)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }, [user?.id])

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    if (!user) return
    
    try {
      const response = await fetch(`/api/chat/messages?conversation_id=${conversationId}`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }, [user?.id])

  const addPendingFiles = useCallback((fileList: FileList | null) => {
    if (!fileList?.length) return
    const next: File[] = []
    for (const file of Array.from(fileList)) {
      if (file.size > CHAT_MAX_FILE_BYTES) {
        alert(`${file.name}: max ${CHAT_MAX_FILE_BYTES / 1024 / 1024}MB`)
        continue
      }
      next.push(file)
    }
    if (next.length) setPendingFiles((prev) => [...prev, ...next])
  }, [])

  // Send message
  const sendMessage = useCallback(async () => {
    if (!selectedConversation || sending) return
    if (!messageText.trim() && pendingFiles.length === 0) return

    setSending(true)
    try {
      let response: Response
      if (pendingFiles.length > 0) {
        const form = new FormData()
        form.append('conversation_id', selectedConversation.id)
        form.append('content', messageText.trim())
        pendingFiles.forEach((file) => form.append('files', file))
        response = await fetch('/api/chat/messages', {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
      } else {
        response = await fetch('/api/chat/messages', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: selectedConversation.id,
            content: messageText,
          }),
        })
      }

      if (response.ok) {
        const data = await response.json()
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message?.id)) return prev
          return [...prev, data.message]
        })
        setMessageText('')
        setPendingFiles([])
        if (fileInputRef.current) fileInputRef.current.value = ''
        fetchConversations()
      } else {
        const err = await response.json().catch(() => ({}))
        alert(err.error || 'Failed to send message')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }, [messageText, pendingFiles, selectedConversation, sending, fetchConversations])

  // Start new 1:1 conversation
  const startConversation = useCallback(async (userId: string) => {
    if (!user) return
    if (userId === user.id) return

    try {
      const existingConv = conversations.find((conv) => conv.other_participant.id === userId)
      if (existingConv) {
        setSelectedConversation(existingConv)
        setActiveView('conversations')
        fetchMessages(existingConv.id)
        return
      }

      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant2_id: userId }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) return

      const conv = data.conversation as Conversation | undefined
      if (!conv?.id) return

      setConversations((prev) => {
        const without = prev.filter((c) => c.id !== conv.id)
        return [conv, ...without]
      })
      setSelectedConversation(conv)
      setActiveView('conversations')
      setMessages([])
      fetchMessages(conv.id)
      void fetchConversations()
    } catch (error) {
      console.error('Error starting conversation:', error)
    }
  }, [user?.id, conversations, fetchMessages, fetchConversations])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen && user) {
      fetchConversations()
      fetchUsers()
    }
  }, [isOpen, user?.id, fetchConversations, fetchUsers])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
    }
  }, [selectedConversation, fetchMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!selectedConversation || !user) return

    const channel = supabase
      .channel(`messages:${selectedConversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversation.id}`,
        },
        (payload) => {
          const row = payload.new as Message | undefined
          if (row?.id && row.sender_id !== user.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev
              return [
                ...prev,
                {
                  ...row,
                  sender: {
                    id: row.sender_id,
                    full_name: selectedConversation.other_participant.full_name,
                    role: selectedConversation.other_participant.role,
                  },
                },
              ]
            })
          }
          void fetchConversations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedConversation, user?.id, supabase, fetchMessages, fetchConversations])

  const formatTime = (dateString: string) => formatClinicChatTime(dateString, language)

  const displayName =
    profile?.display_name ??
    resolveDisplayName({
      full_name: profile?.full_name,
      email: profile?.email ?? user?.email,
      userMetadata: user?.user_metadata,
      fallback: 'User',
    })

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredConversations = conversations.filter((conv) =>
    !normalizedSearch || conv.other_participant.full_name.toLowerCase().includes(normalizedSearch)
  )
  const filteredUsers = users.filter((userItem) => {
    if (userItem.uid === user?.id) return false
    if (!normalizedSearch) return true
    const name = (userItem.full_name || '').toLowerCase()
    return name.includes(normalizedSearch) || userItem.role.toLowerCase().includes(normalizedSearch)
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-0 md:p-6 backdrop-blur-sm transition-opacity">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white md:h-[88vh] md:max-w-5xl md:flex-row md:rounded-3xl md:shadow-2xl border border-slate-200/80">
        
        {/* Left Sidebar / Directory Panel */}
        <div
          className={`${
            selectedConversation ? 'hidden md:flex' : 'flex'
          } w-full md:w-80 lg:w-96 flex-col border-r border-slate-200/80 bg-[#f8f9fe] shrink-0 min-h-0`}
        >
          {/* Sidebar Header */}
          <div className="shrink-0 bg-[#f8f9fe] p-4 border-b border-slate-200/60">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('chat.hello')}</p>
                <h2 className="text-lg font-bold text-slate-900 truncate">{displayName}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('chat.search')}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            {/* Tab Controls */}
            <div className="flex rounded-xl bg-slate-200/60 p-1">
              <button
                type="button"
                onClick={() => setActiveView('conversations')}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeView === 'conversations'
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('chat.tab_all')} ({conversations.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveView('new-chat')}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeView === 'new-chat'
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('chat.tab_contacts')} ({filteredUsers.length})
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner message={t('common.loading')} variant="light" />
              </div>
            ) : activeView === 'conversations' ? (
              filteredConversations.length === 0 ? (
                <div className="rounded-2xl bg-white p-8 text-center border border-slate-200/60 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">{t('chat.empty_conversations')}</p>
                  <p className="mt-1 text-xs text-slate-500">{t('chat.start_new')}</p>
                  <button
                    type="button"
                    onClick={() => setActiveView('new-chat')}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 shadow-sm"
                  >
                    {t('chat.tab_contacts')}
                  </button>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = selectedConversation?.id === conv.id
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => {
                        setSelectedConversation(conv)
                        fetchMessages(conv.id)
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                        isSelected
                          ? 'bg-violet-600 text-white shadow-md ring-2 ring-violet-500/30'
                          : 'bg-white text-slate-900 hover:bg-violet-50/60 border border-slate-200/60 shadow-sm'
                      }`}
                    >
                      <ChatAvatar name={conv.other_participant.full_name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className={`truncate font-semibold text-sm ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            {conv.other_participant.full_name}
                          </p>
                          <span className={`shrink-0 text-[11px] ${isSelected ? 'text-violet-200' : 'text-slate-400'}`}>
                            {formatTime(conv.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <RoleBadge role={conv.other_participant.role} />
                        </div>
                      </div>
                    </button>
                  )
                })
              )
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center border border-slate-200/60 shadow-sm">
                <p className="text-sm font-semibold text-slate-800">{t('chat.no_users')}</p>
                <p className="mt-1 text-xs text-slate-500">{t('chat.no_users_hint')}</p>
              </div>
            ) : (
              filteredUsers.map((userItem) => (
                <button
                  key={userItem.uid}
                  type="button"
                  onClick={() => startConversation(userItem.uid)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left border border-slate-200/60 shadow-sm hover:bg-violet-50/60 transition-all"
                >
                  <ChatAvatar name={userItem.full_name || t('chat.unknown')} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-sm text-slate-900">
                      {userItem.full_name || t('chat.unknown')}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <RoleBadge role={userItem.role} />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Main Chat Panel */}
        <div
          className={`${
            !selectedConversation ? 'hidden md:flex' : 'flex'
          } flex-1 flex-col min-h-0 bg-white`}
        >
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#fbfcfd] shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedConversation(null)
                      setActiveView('conversations')
                    }}
                    className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    aria-label="Back"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <ChatAvatar name={selectedConversation.other_participant.full_name} size="md" />
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900 text-base">
                      {selectedConversation.other_participant.full_name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <RoleBadge role={selectedConversation.other_participant.role} />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages Container */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f8f9fc]">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center py-16 text-center text-slate-400 text-sm">
                    {t('chat.start_new')}
                  </div>
                ) : (
                  messages.map((message) => {
                    const isOwn = message.sender_id === user?.id
                    const attachments = message.attachments ?? []
                    const showText = !isAttachmentOnlyContent(message.content, attachments.length > 0)
                    return (
                      <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[min(80%,440px)] rounded-2xl px-4 py-3 shadow-sm ${
                            isOwn
                              ? 'rounded-br-xs bg-violet-600 text-white'
                              : 'rounded-bl-xs bg-white text-slate-900 border border-slate-200/80'
                          }`}
                        >
                          {showText && message.content?.trim() && (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                          )}
                          {!showText && attachments.length > 0 && (
                            <p className={`text-sm ${isOwn ? 'text-violet-100' : 'text-slate-600'}`}>
                              {t('chat.attachment_only')}
                            </p>
                          )}
                          <ChatMessageAttachments
                            attachments={attachments}
                            downloadLabel={t('chat.download_attachment')}
                            isOwn={isOwn}
                          />
                          <div className={`mt-1.5 flex items-center gap-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                            <span
                              className={`text-[10px] ${isOwn ? 'text-violet-200' : 'text-slate-400'}`}
                              title={formatClinicDateTimeForLanguage(message.created_at, language)}
                            >
                              {formatTime(message.created_at)}
                            </span>
                            {isOwn && message.read_at && (
                              <span className="text-[10px] text-violet-200 font-bold" title="Read">
                                ✓✓
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div className="p-4 border-t border-slate-100 bg-white shrink-0">
                {pendingFiles.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {pendingFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-1.5 text-xs text-slate-700 shadow-sm"
                      >
                        <span className="max-w-[200px] truncate font-medium">{file.name}</span>
                        <span className="text-slate-400">({formatChatFileSize(file.size)})</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                          className="text-slate-400 hover:text-rose-600 ml-1 font-bold text-sm"
                          aria-label={t('chat.remove_attachment')}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-2 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={CHAT_FILE_ACCEPT}
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addPendingFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    title={t('chat.attach_file')}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 hover:text-violet-600 disabled:opacity-50 transition-colors"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                  </button>
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder={t('chat.placeholder')}
                    className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    disabled={sending}
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={(!messageText.trim() && pendingFiles.length === 0) || sending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    aria-label={t('common.send')}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-12 text-center bg-[#f8f9fc]">
              <div className="h-16 w-16 rounded-3xl bg-violet-100 text-violet-600 flex items-center justify-center mb-4 shadow-sm">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">MyClinicMD Internal Chat</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Select a conversation from the left sidebar or start a new chat with your clinic staff and administrators.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
