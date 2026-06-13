'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from './LoadingSpinner'
import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage, formatClinicChatTime } from '@/lib/datetime/clinic-timezone'


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

function ChatMessageAttachments({
  attachments,
  downloadLabel,
}: {
  attachments: ChatAttachment[]
  downloadLabel: string
}) {
  if (!attachments.length) return null

  return (
    <div className="space-y-2 mt-1">
      {attachments.map((att) => {
        const isImage = att.file_type?.startsWith('image/')
        return (
          <div key={att.id} className="rounded-lg overflow-hidden border border-slate-200/80 bg-white/90">
            {isImage && att.file_url ? (
              <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={att.file_url}
                  alt={att.file_name}
                  className="max-w-full max-h-48 object-contain bg-slate-50"
                />
              </a>
            ) : null}
            <div
              className={`px-2.5 py-2 flex items-center gap-2 bg-white ${isImage ? 'border-t border-slate-100' : ''}`}
            >
              <svg
                className="w-4 h-4 shrink-0 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate text-slate-800">{att.file_name}</p>
                <p className="text-[10px] text-slate-500">{formatChatFileSize(att.file_size)}</p>
              </div>
              {att.file_url && (
                <a
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] font-semibold shrink-0 px-2 py-1 rounded bg-[#2E6EF3]/10 text-[#2E6EF3] hover:bg-[#2E6EF3]/20"
                >
                  {downloadLabel}
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
  const supabase = createClient()
  const [activeView, setActiveView] = useState<'conversations' | 'new-chat'>('conversations')
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedConversation(null)
                setActiveView('conversations')
              }}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Back"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t('chat.title')}</h2>
              <p className="text-xs text-slate-500">{t('chat.one_on_one_hint')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Conversations List */}
          {!selectedConversation && (
            <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
              {/* Tabs */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setActiveView('conversations')}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                    activeView === 'conversations'
                      ? 'text-[#2E6EF3] border-b-2 border-[#2E6EF3]'
                      : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'
                  }`}
                >
                  {t('chat.tab_conversations')}
                </button>
                <button
                  onClick={() => setActiveView('new-chat')}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                    activeView === 'new-chat'
                      ? 'text-[#2E6EF3] border-b-2 border-[#2E6EF3]'
                      : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'
                  }`}
                >
                  {t('chat.tab_new')}
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <LoadingSpinner message={t('common.loading')} />
                  </div>
                ) : activeView === 'conversations' ? (
                  <div className="divide-y divide-slate-100">
                    {conversations.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-slate-700 font-medium">{t('chat.empty_conversations')}</p>
                        <p className="text-slate-500 text-sm mt-1">{t('chat.start_new')}</p>
                      </div>
                    ) : (
                      conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => {
                            setSelectedConversation(conv)
                            fetchMessages(conv.id)
                          }}
                          className="w-full p-4 text-left hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-[#2E6EF3] rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                              {conv.other_participant.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <p className="text-slate-900 font-semibold text-sm truncate">
                                  {conv.other_participant.full_name}
                                </p>
                                <span className="text-xs text-slate-400 ml-2 shrink-0">
                                  {formatTime(conv.last_message_at)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 capitalize">
                                {conv.other_participant.role}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {users.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-slate-700 font-medium mb-1">{t('chat.no_users')}</p>
                        <p className="text-xs text-slate-500 mb-4">
                          {t('chat.no_users_hint')}
                        </p>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/chat/sync-profiles', {
                                method: 'POST',
                                credentials: 'include',
                                headers: {
                                  'Content-Type': 'application/json',
                                }
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
                          className="px-4 py-2 bg-[#2E6EF3]/10 border border-[#2E6EF3]/20 text-[#2E6EF3] rounded-lg text-xs font-semibold hover:bg-[#2E6EF3]/15 transition-colors"
                        >
                          {t('chat.sync_profiles')}
                        </button>
                      </div>
                    ) : (
                      users
                        .filter((userItem) => userItem.uid !== user?.id)
                        .map((userItem) => (
                        <button
                          key={userItem.uid}
                          onClick={() => startConversation(userItem.uid)}
                          className="w-full p-4 text-left hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-[#2E6EF3] rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                              {userItem.full_name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-900 font-semibold text-sm truncate">
                                {userItem.full_name || t('chat.unknown')}
                              </p>
                              <p className="text-xs text-slate-500 capitalize">
                                {userItem.role}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Chat Area */}
          {selectedConversation ? (
            <div className="flex-1 flex flex-col bg-[#f9fbff]">
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#2E6EF3] rounded-full flex items-center justify-center text-white font-semibold">
                    {selectedConversation.other_participant.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-slate-900 font-semibold text-sm">
                      {selectedConversation.other_participant.full_name}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">
                      {selectedConversation.other_participant.role}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {messages.map((message) => {
                  const isOwn = message.sender_id === user?.id
                  const attachments = message.attachments ?? []
                  const showText = !isAttachmentOnlyContent(message.content, attachments.length > 0)
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[min(75%,320px)] rounded-2xl px-4 py-2.5 shadow-sm ${
                        isOwn
                          ? 'bg-[#2E6EF3] text-white rounded-tr-sm'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'
                      }`}>
                        {!isOwn && (
                          <p className="text-xs font-semibold text-[#2E6EF3] mb-0.5">
                            {message.sender.full_name}
                          </p>
                        )}
                        {showText && message.content?.trim() && (
                          <p className="text-sm leading-relaxed">{message.content}</p>
                        )}
                        {!showText && attachments.length > 0 && (
                          <p className={`text-sm ${isOwn ? 'text-white/90' : 'text-slate-600'}`}>
                            {t('chat.attachment_only')}
                          </p>
                        )}
                        <ChatMessageAttachments
                          attachments={attachments}
                          downloadLabel={t('chat.download_attachment')}
                        />
                        <div className={`flex items-center gap-2 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <span className={`text-[10px] ${isOwn ? 'text-white/70' : 'text-slate-400'}`} title={formatClinicDateTimeForLanguage(message.created_at, language)}>
                            {formatTime(message.created_at)}
                          </span>
                          {isOwn && message.read_at && (
                            <span className="text-[10px] text-white/70" title="Read">✓✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-3 border-t border-slate-200 bg-white">
                {pendingFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pendingFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="inline-flex items-center gap-2 max-w-full px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700"
                      >
                        <span className="truncate max-w-[180px]">{file.name}</span>
                        <span className="text-slate-400 shrink-0">({formatChatFileSize(file.size)})</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                          className="text-slate-500 hover:text-red-600 shrink-0"
                          aria-label={t('chat.remove_attachment')}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mb-2">{t('chat.attachments_hint')}</p>
                <div className="flex gap-2 items-end">
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
                    className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#2E6EF3] transition-colors disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className="flex-1 h-11 px-4 bg-[#f9fbff] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] focus:border-transparent"
                    disabled={sending}
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={(!messageText.trim() && pendingFiles.length === 0) || sending}
                    className="h-11 px-5 bg-[#2E6EF3] text-white rounded-xl text-sm font-semibold hover:bg-[#1f5ad2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? t('common.sending') : t('common.send')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#f9fbff]">
              <div className="text-center">
                <div className="w-16 h-16 bg-[#2E6EF3]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-slate-700 font-medium">{t('chat.select_conv')}</p>
                <p className="text-slate-500 text-sm mt-1">{t('chat.select_conv_hint')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
