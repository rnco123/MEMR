'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from './LoadingSpinner'

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
}

interface ChatProps {
  isOpen: boolean
  onClose: () => void
}

export function Chat({ isOpen, onClose }: ChatProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const [activeView, setActiveView] = useState<'conversations' | 'new-chat'>('conversations')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return
    
    try {
      const response = await fetch('/api/chat/conversations')
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
      const response = await fetch('/api/chat/users')
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
      const response = await fetch(`/api/chat/messages?conversation_id=${conversationId}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }, [user])

  // Send message
  const sendMessage = useCallback(async () => {
    if (!messageText.trim() || !selectedConversation || sending) return

    setSending(true)
    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConversation.id,
          content: messageText,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setMessages(prev => [...prev, data.message])
        setMessageText('')
        // Refresh conversations to update last_message_at
        fetchConversations()
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }, [messageText, selectedConversation, sending, fetchConversations])

  // Start new conversation
  const startConversation = useCallback(async (userId: string) => {
    if (!user) return

    try {
      // Check if conversation already exists
      const existingConv = conversations.find(
        conv => conv.other_participant.id === userId
      )

      if (existingConv) {
        setSelectedConversation(existingConv)
        setActiveView('conversations')
        fetchMessages(existingConv.id)
        return
      }

      // Create new conversation
      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant2_id: userId }),
      })

      if (response.ok) {
        const data = await response.json()
        // Fetch updated conversations list
        const updatedResponse = await fetch('/api/chat/conversations')
        if (updatedResponse.ok) {
          const updatedData = await updatedResponse.json()
          const newConv = updatedData.conversations?.find(
            (conv: Conversation) => conv.id === data.conversation.id
          )
          if (newConv) {
            setConversations(updatedData.conversations || [])
            setSelectedConversation(newConv)
            setActiveView('conversations')
            fetchMessages(newConv.id)
          }
        }
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
    }
  }, [user, conversations, fetchMessages])

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
          // Fetch updated messages when new message arrives
          fetchMessages(selectedConversation.id)
          fetchConversations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedConversation, user, supabase, fetchMessages, fetchConversations])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    // If same day, show time only
    if (days === 0) {
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      if (minutes < 1) return `Just now (${timeStr})`
      if (minutes < 60) return `${timeStr} (${minutes}m ago)`
      return timeStr
    }

    // If yesterday
    if (days === 1) {
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      return `Yesterday ${timeStr}`
    }

    // If within a week, show day and time
    if (days < 7) {
      const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' })
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      return `${dayStr} ${timeStr}`
    }

    // Otherwise show full date and time
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    return `${dateStr} ${timeStr}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/20 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedConversation(null)
                setActiveView('conversations')
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-xl font-bold text-white">Chat</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Conversations List */}
          {!selectedConversation && (
            <div className="w-80 border-r border-white/10 bg-slate-800 flex flex-col">
              {/* Tabs */}
              <div className="flex border-b border-white/10">
                <button
                  onClick={() => setActiveView('conversations')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                    activeView === 'conversations'
                      ? 'text-white bg-white/10 border-b-2 border-blue-500'
                      : 'text-blue-200 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Conversations
                </button>
                <button
                  onClick={() => setActiveView('new-chat')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                    activeView === 'new-chat'
                      ? 'text-white bg-white/10 border-b-2 border-blue-500'
                      : 'text-blue-200 hover:text-white hover:bg-white/5'
                  }`}
                >
                  New Chat
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner message="Loading..." />
                  </div>
                ) : activeView === 'conversations' ? (
                  <div className="divide-y divide-white/10">
                    {conversations.length === 0 ? (
                      <div className="p-8 text-center text-blue-200">
                        <p>No conversations yet</p>
                        <p className="text-sm mt-2">Start a new chat to begin messaging</p>
                      </div>
                    ) : (
                      conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => {
                            setSelectedConversation(conv)
                            fetchMessages(conv.id)
                          }}
                          className="w-full p-4 text-left hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                              {conv.other_participant.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-white font-semibold truncate">
                                  {conv.other_participant.full_name}
                                </p>
                                <span className="text-xs text-blue-300 ml-2">
                                  {formatTime(conv.last_message_at)}
                                </span>
                              </div>
                              <p className="text-xs text-blue-200 capitalize">
                                {conv.other_participant.role}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {users.length === 0 ? (
                      <div className="p-8 text-center text-blue-200">
                        <p className="mb-2">No users available</p>
                        <p className="text-sm text-blue-300/70 mb-4">
                          Make sure other staff members have profiles in the system.
                        </p>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/chat/sync-profiles', { method: 'POST' })
                              const data = await response.json()
                              if (response.ok) {
                                alert(data.message || 'Profiles synced successfully!')
                                fetchUsers()
                              } else {
                                alert(data.error || 'Failed to sync profiles')
                              }
                            } catch (error) {
                              console.error('Error syncing profiles:', error)
                              alert('Error syncing profiles')
                            }
                          }}
                          className="px-4 py-2 bg-blue-500/20 border border-blue-500/50 text-blue-300 rounded-lg text-sm hover:bg-blue-500/30 transition-all"
                        >
                          Sync Profiles (Admin)
                        </button>
                      </div>
                    ) : (
                      users.map((userItem) => (
                        <button
                          key={userItem.uid}
                          onClick={() => startConversation(userItem.uid)}
                          className="w-full p-4 text-left hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                              {userItem.full_name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold truncate">
                                {userItem.full_name || 'Unknown'}
                              </p>
                              <p className="text-xs text-blue-200 capitalize">
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
            <div className="flex-1 flex flex-col bg-slate-800">
              {/* Chat Header */}
              <div className="p-4 border-b border-white/10 bg-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold">
                    {selectedConversation.other_participant.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-semibold">
                      {selectedConversation.other_participant.full_name}
                    </p>
                    <p className="text-xs text-blue-200 capitalize">
                      {selectedConversation.other_participant.role}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
              >
                {messages.map((message) => {
                  const isOwn = message.sender_id === user?.id
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-tr-none'
                          : 'bg-white/10 text-white rounded-tl-none'
                      }`}>
                        {!isOwn && (
                          <p className="text-xs font-medium opacity-80 mb-1">
                            {message.sender.full_name}
                          </p>
                        )}
                        <p className="text-sm">{message.content}</p>
                        <div className={`flex items-center gap-2 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-xs opacity-60" title={new Date(message.created_at).toLocaleString()}>
                            {formatTime(message.created_at)}
                          </span>
                          {isOwn && message.read_at && (
                            <span className="text-xs opacity-60" title="Read">✓✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-white/10 bg-slate-800">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
                    disabled={sending}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!messageText.trim() || sending}
                    className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-blue-200">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p>Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
