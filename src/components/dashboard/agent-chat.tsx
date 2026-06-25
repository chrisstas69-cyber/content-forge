'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, X, Send, Loader2, Sparkles, Trash2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

interface Message {
  id?: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  toolCalls?: any[]
}

export function AgentChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Load existing conversation if we have one
  const { data: conversationData } = useQuery({
    queryKey: ['agent-conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null
      const res = await fetch(`/api/agent/conversations/${conversationId}`)
      return res.json()
    },
    enabled: !!conversationId,
  })

  useEffect(() => {
    if (conversationData?.conversation?.messages) {
      setMessages(conversationData.conversation.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolName: m.toolName,
        toolCalls: m.toolCalls,
      })))
    }
  }, [conversationData])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  async function send() {
    if (!input.trim() || sending) return
    const userMessage = input.trim()
    setInput('')
    setSending(true)
    // Add user message immediately for instant feedback
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, conversationId: conversationId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chat failed')
      setConversationId(data.conversationId)
      // Reload conversation to get full message history including tool calls
      queryClient.invalidateQueries({ queryKey: ['agent-conversation', data.conversationId] })
      // Also invalidate other data the agent might have changed
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['trends'] })
    } catch (err: any) {
      toast.error(err.message)
      // Remove the user message we optimistically added
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setSending(false)
    }
  }

  async function newConversation() {
    setConversationId(null)
    setMessages([])
  }

  // Floating button when closed
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
        title="Open AI Agent"
      >
        <Sparkles className="size-6" />
        <span className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-400 ring-2 ring-white" />
      </button>
    )
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[420px] bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <Sparkles className="size-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Agent</h3>
            <p className="text-[10px] text-neutral-500">Your content strategist</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={newConversation} title="New conversation" className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <MessageSquare className="size-4 text-neutral-500" />
            </button>
          )}
          <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="size-4 text-neutral-500" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className="size-8 mx-auto text-orange-400 mb-2" />
            <p className="text-sm font-medium">Hi! I'm your AI content agent.</p>
            <p className="text-xs text-neutral-500 mt-1">Ask me anything — I can see your videos, schedule posts, check trends, and more.</p>
            <div className="mt-4 space-y-1 text-left">
              {[
                "What should I post this week?",
                "Show me my top performing videos",
                "What's trending in my niche right now?",
                "Schedule my ready videos at optimal times",
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={m.id || i} message={m} />
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-neutral-500 pl-2">
            <Loader2 className="size-3 animate-spin" />
            <span>Thinking…</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask your agent anything…"
            rows={1}
            className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm resize-none max-h-32"
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="size-9 rounded-lg bg-orange-500 text-white flex items-center justify-center disabled:opacity-50"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'tool') {
    // Tool results — show as a collapsed chip
    return (
      <div className="ml-6 my-1">
        <div className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-mono">
          <ChevronDown className="size-3" />
          <span>used tool: {message.toolName}</span>
        </div>
        <details className="mt-1">
          <summary className="text-[10px] text-neutral-400 cursor-pointer hover:text-neutral-600">view result</summary>
          <pre className="mt-1 text-[10px] text-neutral-500 bg-neutral-50 dark:bg-neutral-950 p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">{message.content}</pre>
        </details>
      </div>
    )
  }

  const isUser = message.role === 'user'
  // Strip out tool_calls display from assistant content if empty
  const hasContent = message.content && message.content.trim().length > 0

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${isUser
        ? 'bg-orange-500 text-white rounded-br-sm'
        : 'bg-neutral-100 dark:bg-neutral-800 rounded-bl-sm'
      }`}>
        {!hasContent && message.toolCalls ? (
          <span className="text-xs italic opacity-70">Calling tools…</span>
        ) : (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}
      </div>
    </div>
  )
}
