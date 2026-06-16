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
    sm: 'h-10 w-10 text-sm',
    md: 'h-12 w-12 text-base',
    lg: 'h-14 w-14 text-lg',
  }
  return (
    <div
      className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-full bg-violet-500 font-semibold text-white shadow-sm`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function ChatWaveDivider() {
  return (
    <svg
      className="block h-5 w-full text-[#F4F4F8]"
      viewBox="0 0 1440 48"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M0,24 C240,44 480,4 720,24 C960,44 1200,4 1440,24 L1440,48 L0,48 Z"
      />
    </svg>
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
  const [searchOpen, setSearchOpen] = useState(false)
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
  }, [user])

  // Fetch users for new chat
  const fetchUsers = useCallback(async () => {
    if (!user) return
    
    try {
      const response = await fetch('/api/chat/users', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Fetched users:', data.users?.length || 0)
        setUsers(data.users || [])
      } else {
        const errorData = await response.json()
        console.error('Error fetching users:', errorData)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }, [user])

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
  }, [user])

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

  // Send message (text and/or attachments)
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
        console.error('Error sending message:', err.error || response.statusText)
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
      if (!response.ok) {
        console.error('Error starting conversation:', data.error || response.statusText)
        return
      }

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
  }, [user, conversations, fetchMessages, fetchConversations])

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen && user) {
      fetchConversations()
      fetchUsers()
    }
  }, [isOpen, user, fetchConversations, fetchUsers])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
    }
  }, [selectedConversation, fetchMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Set up realtime subscription for new messages
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
  }, [selectedConversation, user, supabase, fetchMessages, fetchConversations])

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
    <div className="fixed inset-0 z-50 bg-[#F4F4F8] sm:flex sm:items-center sm:justify-center sm:bg-slate-900/45 sm:p-4 sm:backdrop-blur-sm">
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#F4F4F8] sm:h-[min(90vh,820px)] sm:max-w-md sm:rounded-[2rem] sm:shadow-2xl">
        {!selectedConversation ? (
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* List screen header */}
            <div className="shrink-0 bg-[#F4F4F8] px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">{t('chat.hello')}</p>
                  <h2 className="text-2xl font-bold text-slate-900">{displayName}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen((open) => {
                        if (open) setSearchQuery('')
                        return !open
                      })
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm"
                    aria-label={t('chat.search')}
                    title={t('chat.search')}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {searchOpen && (
                <div className="mb-3">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('chat.search')}
                    autoFocus
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                  />
                </div>
              )}

              <div className="flex rounded-2xl bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveView('conversations')}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    activeView === 'conversations'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t('chat.tab_all')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('new-chat')}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    activeView === 'new-chat'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t('chat.tab_contacts')}
                </button>
              </div>
            </div>

            {/* List content */}
            <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-24">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <LoadingSpinner message={t('common.loading')} />
                </div>
              ) : activeView === 'conversations' ? (
                filteredConversations.length === 0 ? (
                  <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-sm">
                    <p className="font-semibold text-slate-800">{t('chat.empty_conversations')}</p>
                    <p className="mt-1 text-sm text-slate-500">{t('chat.start_new')}</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {filteredConversations.map((conv) => (
                      <li key={conv.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedConversation(conv)
                            fetchMessages(conv.id)
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-3 text-left shadow-sm transition-transform active:scale-[0.99]"
                        >
                          <ChatAvatar name={conv.other_participant.full_name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate font-semibold text-slate-900">
                                {conv.other_participant.full_name}
                              </p>
                              <span className="shrink-0 text-xs text-slate-400">
                                {formatTime(conv.last_message_at)}
                              </span>
                            </div>
                            <p className="truncate text-sm capitalize text-slate-500">
                              {conv.other_participant.role}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : filteredUsers.length === 0 ? (
                <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-sm">
                  <p className="font-semibold text-slate-800">{t('chat.no_users')}</p>
                  <p className="mt-1 text-sm text-slate-500">{t('chat.no_users_hint')}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/chat/sync-profiles', {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                        })
                        const data = await response.json()
                        if (response.ok) {
                          alert(data.message || 'Profiles synced successfully!')
                          fetchUsers()
                        } else {
                          alert(data.error || 'Failed to sync profiles')
                        }
                      } catch (error) {
                        console.error('Error syncing profiles:', error)
                        alert('Error syncing profiles: ' + (error instanceof Error ? error.message : 'Unknown error'))
                      }
                    }}
                    className="mt-4 rounded-xl bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                  >
                    {t('chat.sync_profiles')}
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filteredUsers.map((userItem) => (
                    <li key={userItem.uid}>
                      <button
                        type="button"
                        onClick={() => startConversation(userItem.uid)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-3 text-left shadow-sm transition-transform active:scale-[0.99]"
                      >
                        <ChatAvatar name={userItem.full_name || t('chat.unknown')} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">
                            {userItem.full_name || t('chat.unknown')}
                          </p>
                          <p className="truncate text-sm capitalize text-slate-500">{userItem.role}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* FAB */}
            <button
              type="button"
              onClick={() => setActiveView('new-chat')}
              className="absolute bottom-6 right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/35 transition-transform active:scale-95"
              aria-label={t('chat.new_message')}
              title={t('chat.new_message')}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="relative shrink-0 bg-violet-600 pb-0 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedConversation(null)
                    setActiveView('conversations')
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
                  aria-label="Back"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <ChatAvatar name={selectedConversation.other_participant.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{selectedConversation.other_participant.full_name}</p>
                  <p className="text-xs capitalize text-violet-200">{t('chat.online')}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 text-white/90 hover:bg-white/10"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ChatWaveDivider />
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto bg-[#F4F4F8] px-4 py-4">
              <div className="space-y-3">
                {messages.map((message) => {
                  const isOwn = message.sender_id === user?.id
                  const attachments = message.attachments ?? []
                  const showText = !isAttachmentOnlyContent(message.content, attachments.length > 0)
                  return (
                    <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[min(82%,320px)] rounded-[1.25rem] px-4 py-2.5 shadow-sm ${
                          isOwn
                            ? 'rounded-br-md bg-white text-slate-800'
                            : 'rounded-bl-md bg-violet-500 text-white'
                        }`}
                      >
                        {showText && message.content?.trim() && (
                          <p className="text-sm leading-relaxed">{message.content}</p>
                        )}
                        {!showText && attachments.length > 0 && (
                          <p className={`text-sm ${isOwn ? 'text-slate-600' : 'text-white/90'}`}>
                            {t('chat.attachment_only')}
                          </p>
                        )}
                        <ChatMessageAttachments
                          attachments={attachments}
                          downloadLabel={t('chat.download_attachment')}
                          isOwn={isOwn}
                        />
                        <div className={`mt-1 flex items-center gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <span
                            className={`text-[10px] ${isOwn ? 'text-slate-400' : 'text-white/70'}`}
                            title={formatClinicDateTimeForLanguage(message.created_at, language)}
                          >
                            {formatTime(message.created_at)}
                          </span>
                          {isOwn && message.read_at && (
                            <span className="text-[10px] text-violet-500" title="Read">
                              ✓✓
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="shrink-0 bg-[#F4F4F8] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
              {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm"
                    >
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <span className="shrink-0 text-slate-400">({formatChatFileSize(file.size)})</span>
                      <button
                        type="button"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                        className="shrink-0 text-slate-500 hover:text-red-600"
                        aria-label={t('chat.remove_attachment')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-2 shadow-md">
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title={t('chat.attach_file')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50 hover:text-violet-600 disabled:opacity-50"
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
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={(!messageText.trim() && pendingFiles.length === 0) || sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t('common.send')}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
