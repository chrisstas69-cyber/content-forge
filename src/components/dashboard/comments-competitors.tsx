'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, MessageCircle, Send, RefreshCw, Check, X, AlertCircle } from 'lucide-react'
import { useState } from 'react'

export function Comments() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'pending' | 'replied' | 'ignored' | 'all'>('pending')
  const [fetching, setFetching] = useState(false)
  const [editingReply, setEditingReply] = useState<string | null>(null)
  const [customReply, setCustomReply] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['comments', filter],
    queryFn: async () => (await fetch(`/api/comments?status=${filter}`)).json(),
  })

  async function fetchNew() {
    setFetching(true)
    try {
      const res = await fetch('/api/comments', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`Fetched ${data.fetched} new comments, ${data.suggested} replies suggested, ${data.replied} auto-replied`)
      queryClient.invalidateQueries({ queryKey: ['comments'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setFetching(false)
    }
  }

  async function approve(commentId: string) {
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText: customReply || undefined }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Reply posted!')
      setEditingReply(null)
      setCustomReply('')
      queryClient.invalidateQueries({ queryKey: ['comments'] })
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function ignore(commentId: string) {
    await fetch(`/api/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ignored' }),
    })
    queryClient.invalidateQueries({ queryKey: ['comments'] })
  }

  const comments: any[] = data?.comments || []

  const filters = [
    { id: 'pending' as const, label: 'Pending', color: 'bg-amber-100 text-amber-700' },
    { id: 'replied' as const, label: 'Replied', color: 'bg-emerald-100 text-emerald-700' },
    { id: 'ignored' as const, label: 'Ignored', color: 'bg-neutral-100 text-neutral-500' },
    { id: 'all' as const, label: 'All', color: 'bg-blue-100 text-blue-700' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">Comment Replies</h2>
          <p className="text-sm text-neutral-500 mt-1">AI generates replies in your voice. Approve or edit before posting, or enable auto-reply in Settings.</p>
        </div>
        <button
          onClick={fetchNew}
          disabled={fetching}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {fetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {fetching ? 'Fetching…' : 'Fetch new comments'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${filter === f.id ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'border border-neutral-200 dark:border-neutral-800'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
      ) : comments.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <MessageCircle className="size-12 mx-auto text-neutral-300 mb-3" />
          <h3 className="font-semibold">No comments to show</h3>
          <p className="text-sm text-neutral-500 mt-1 mb-4">Click "Fetch new comments" to pull recent comments from your published posts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
              <div className="flex items-start gap-3">
                {c.videoThumbnail && <img src={c.videoThumbnail} alt="" className="size-12 rounded object-cover" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{c.authorName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 capitalize">{c.platform}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      c.replyStatus === 'replied' ? 'bg-emerald-100 text-emerald-700' :
                      c.replyStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                      c.replyStatus === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-neutral-100 text-neutral-500'
                    }`}>{c.replyStatus}</span>
                  </div>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-2">{c.text}</p>
                  {c.videoTitle && <p className="text-xs text-neutral-500 mb-2">on "{c.videoTitle}"</p>}

                  {/* AI suggested reply */}
                  {c.replyText && (
                    <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                      <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase mb-1">AI suggested reply</p>
                      {editingReply === c.id ? (
                        <div>
                          <textarea
                            value={customReply}
                            onChange={e => setCustomReply(e.target.value)}
                            rows={2}
                            className="w-full px-2 py-1 rounded border border-blue-200 dark:border-blue-800 bg-white dark:bg-neutral-900 text-sm"
                          />
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => approve(c.id)} className="px-3 py-1 text-xs rounded bg-blue-500 text-white">Post</button>
                            <button onClick={() => { setEditingReply(null); setCustomReply('') }} className="px-3 py-1 text-xs rounded border">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-blue-900 dark:text-blue-100">{c.replyText}</p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {c.replyStatus === 'pending' && c.replyText && editingReply !== c.id && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => approve(c.id)} className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-emerald-500 text-white">
                        <Check className="size-3" /> Approve & Post
                      </button>
                      <button onClick={() => { setEditingReply(c.id); setCustomReply(c.replyText) }} className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-800">
                        Edit
                      </button>
                      <button onClick={() => ignore(c.id)} className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md text-neutral-500">
                        <X className="size-3" /> Ignore
                      </button>
                    </div>
                  )}
                  {c.replyStatus === 'replied' && c.repliedAt && (
                    <p className="text-[10px] text-emerald-600 mt-2">Replied at {new Date(c.repliedAt).toLocaleString()}</p>
                  )}
                  {c.replyStatus === 'failed' && c.replyError && (
                    <p className="text-[10px] text-red-600 mt-2 flex items-center gap-1"><AlertCircle className="size-3" /> {c.replyError}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function VoiceProfileSettings() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    persona: '',
    tone: '',
    signaturePhrases: '',
    avoidPhrases: '',
    autoReplyMode: 'suggest',
    replyLength: 'short',
  })
  const [saving, setSaving] = useState(false)

  const { data } = useQuery({
    queryKey: ['voice-profile'],
    queryFn: async () => (await fetch('/api/voice-profile')).json(),
  })

  if (data?.voiceProfile && form.persona === '' && data.voiceProfile.persona) {
    setForm({
      persona: data.voiceProfile.persona || '',
      tone: data.voiceProfile.tone || '',
      signaturePhrases: data.voiceProfile.signaturePhrases || '',
      avoidPhrases: data.voiceProfile.avoidPhrases || '',
      autoReplyMode: data.voiceProfile.autoReplyMode || 'suggest',
      replyLength: data.voiceProfile.replyLength || 'short',
    })
  }

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/voice-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      toast.success('Voice profile saved')
      queryClient.invalidateQueries({ queryKey: ['voice-profile'] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
      <h3 className="font-semibold text-sm">Voice Profile (for AI replies + scripts)</h3>
      <div>
        <label className="text-sm font-medium">Persona</label>
        <input value={form.persona} onChange={e => setForm(f => ({ ...f, persona: e.target.value }))} placeholder="e.g. friendly dog mom who loves puns" className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Tone</label>
        <input value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))} placeholder="e.g. warm, witty, enthusiastic" className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Signature phrases (comma-separated)</label>
        <input value={form.signaturePhrases} onChange={e => setForm(f => ({ ...f, signaturePhrases: e.target.value }))} placeholder="e.g. pawsome, fur-real, zoomies" className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Phrases to avoid</label>
        <input value={form.avoidPhrases} onChange={e => setForm(f => ({ ...f, avoidPhrases: e.target.value }))} placeholder="e.g. literally, basically" className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Reply mode</label>
          <select value={form.autoReplyMode} onChange={e => setForm(f => ({ ...f, autoReplyMode: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
            <option value="suggest">Suggest (manual approval)</option>
            <option value="auto">Auto-reply (no approval)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Reply length</label>
          <select value={form.replyLength} onChange={e => setForm(f => ({ ...f, replyLength: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
            <option value="short">Short (1 sentence)</option>
            <option value="medium">Medium (2-3 sentences)</option>
            <option value="long">Long (3-5 sentences)</option>
          </select>
        </div>
      </div>
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50">
        {saving ? 'Saving…' : 'Save Voice Profile'}
      </button>
    </div>
  )
}

export function Competitors() {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [newPlatform, setNewPlatform] = useState('youtube')
  const [newHandle, setNewHandle] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['competitors'],
    queryFn: async () => (await fetch('/api/competitors')).json(),
  })

  async function addCompetitor() {
    if (!newHandle.trim()) return
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: newPlatform, handle: newHandle.replace('@', '') }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(`Added @${newHandle}`)
      setNewHandle('')
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function removeCompetitor(id: string) {
    await fetch('/api/competitors', { method: 'DELETE', body: JSON.stringify({ id }), headers: { 'Content-Type': 'application/json' } })
    queryClient.invalidateQueries({ queryKey: ['competitors'] })
  }

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/competitors/refresh', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`Checked ${data.checked} competitors, found ${data.newPosts} new posts, ${data.alerts} viral alerts`)
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const competitors: any[] = data?.competitors || []
  const alerts: any[] = data?.alerts || []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">Competitor Monitoring</h2>
          <p className="text-sm text-neutral-500 mt-1">Track competitors and get alerts when their posts go viral. AI suggests how to create your own version.</p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50">
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {refreshing ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {/* Add competitor form */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex gap-2">
        <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)} className="px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="x">X</option>
        </select>
        <input value={newHandle} onChange={e => setNewHandle(e.target.value)} placeholder="@competitor_handle" className="flex-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" onKeyDown={e => e.key === 'Enter' && addCompetitor()} />
        <button onClick={addCompetitor} className="px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium">Add</button>
      </div>

      {/* Tracked competitors */}
      {competitors.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Tracked competitors ({competitors.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {competitors.map(c => (
              <div key={c.id} className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium capitalize">{c.platform} · @{c.handle}</p>
                  <p className="text-[10px] text-neutral-500">{c.postCount} posts · last checked: {c.lastChecked ? new Date(c.lastChecked).toLocaleDateString() : 'never'}</p>
                </div>
                <button onClick={() => removeCompetitor(c.id)} className="text-red-500 text-xs hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Viral alerts */}
      {alerts.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2 text-orange-600">🚨 Viral alerts ({alerts.length})</h3>
          <div className="space-y-3">
            {alerts.map(a => (
              <div key={a.id} className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-xl border border-orange-200 dark:border-orange-900 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">{a.title || '(no title)'}</p>
                    <p className="text-xs text-neutral-500">@{a.competitorHandle} on {a.platform} · score {a.viralScore}/100</p>
                  </div>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View →</a>
                </div>
                {a.suggestedAction && (
                  <div className="mt-2 p-2 rounded bg-white/50 dark:bg-neutral-900/50">
                    <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-300 uppercase mb-1">💡 AI suggestion</p>
                    <p className="text-sm">{a.suggestedAction}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {competitors.length === 0 && alerts.length === 0 && !isLoading && (
        <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <AlertCircle className="size-12 mx-auto text-neutral-300 mb-3" />
          <h3 className="font-semibold">No competitors tracked yet</h3>
          <p className="text-sm text-neutral-500 mt-1">Add competitor handles above to get alerts when their posts go viral.</p>
        </div>
      )}
    </div>
  )
}
