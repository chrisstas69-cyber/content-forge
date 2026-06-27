'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload } from '@/components/dashboard/upload'
import { Dashboard } from '@/components/dashboard'
import { ApiKeys } from '@/components/dashboard/api-keys'
import { AgentChat } from '@/components/dashboard/agent-chat'
import { Trends } from '@/components/dashboard/trends'
import { Analytics } from '@/components/dashboard/analytics'
import { Ideas, Insights } from '@/components/dashboard/ideas-insights'
import { Generate } from '@/components/dashboard/generate'
import { Calendar } from '@/components/dashboard/calendar'
import { BrandKit } from '@/components/dashboard/brandkit'
import { Comments, VoiceProfileSettings, Competitors } from '@/components/dashboard/comments-competitors'
import { Instructions } from '@/components/dashboard/instructions'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'

type Tab = 'dashboard' | 'upload' | 'library' | 'social' | 'settings' | 'assets' | 'apikeys' | 'scheduled' | 'trends' | 'analytics' | 'ideas' | 'insights' | 'generate' | 'calendar' | 'brandkit' | 'comments' | 'competitors' | 'voice' | 'instructions'

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)

  // SSE subscription for live updates
  useEffect(() => {
    if (typeof window === 'undefined') return
    const es = new EventSource('/api/events')
    eventSourceRef.current = es

    es.addEventListener('video.status', (e) => {
      try {
        const data = JSON.parse(e.data)
        queryClient.invalidateQueries({ queryKey: ['videos'] })
        queryClient.invalidateQueries({ queryKey: ['stats'] })
        if (data.data?.status === 'failed') {
          toast.error(`Video failed: ${data.data?.errorMessage || 'Unknown error'}`)
        } else if (data.data?.status === 'ready') {
          toast.success('Video ready to publish! 🎉')
        }
      } catch {}
    })
    es.addEventListener('video.progress', (e) => {
      try {
        const data = JSON.parse(e.data)
        queryClient.invalidateQueries({ queryKey: ['videos'] })
      } catch {}
    })
    es.addEventListener('post.update', (e) => {
      try {
        const data = JSON.parse(e.data)
        queryClient.invalidateQueries({ queryKey: ['videos'] })
        queryClient.invalidateQueries({ queryKey: ['stats'] })
        if (data.data?.status === 'published') {
          toast.success(`Posted to ${data.data?.platformUrl || 'social media'}!`)
        } else if (data.data?.status === 'failed') {
          toast.error(`Publish failed: ${data.data?.error}`)
        }
      } catch {}
    })
    es.onerror = () => {
      // Silent reconnect — EventSource handles automatically
    }
    return () => es.close()
  }, [queryClient])

  return (
    <div className="min-h-screen flex bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans">
      {/* Sidebar - Desktop */}
      <Sidebar tab={tab} setTab={setTab} className="hidden md:flex" />

      {/* Mobile Sidebar / Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm transition-opacity duration-300" 
            onClick={() => setMobileMenuOpen(false)} 
          />
          {/* Drawer content */}
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white dark:bg-neutral-900 pt-5 pb-4 shadow-xl">
            <div className="absolute top-2 right-2">
              <button 
                onClick={() => setMobileMenuOpen(false)} 
                className="p-2 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none"
              >
                <X className="size-5" />
              </button>
            </div>
            <Sidebar tab={tab} setTab={(t) => { setTab(t); setMobileMenuOpen(false); }} isMobile />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-64">
        {/* Mobile Top Header */}
        <header className="flex h-16 items-center justify-between px-4 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-40 md:hidden">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setMobileMenuOpen(true)} 
              className="p-2 -ml-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
            >
              <Menu className="size-5" />
            </button>
            <div className="size-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
              <Sparkles className="size-4.5 text-white" />
            </div>
            <span className="font-bold text-sm">ContentForge</span>
          </div>
          <ThemeToggle />
        </header>

        {/* Desktop Top Header */}
        <header className="hidden md:flex h-16 items-center justify-between px-8 border-b border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-30">
          <h2 className="text-lg font-semibold capitalize">
            {tab === 'brandkit' ? 'Brand Kit' : tab === 'apikeys' ? 'API Keys' : tab}
          </h2>
          <ThemeToggle />
        </header>

        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
          {tab === 'upload' && <Upload />}
          {tab === 'library' && <Library />}
          {tab === 'social' && <SocialAccounts onNavigate={setTab} />}
          {tab === 'scheduled' && <Scheduled />}
          {tab === 'trends' && <Trends />}
          {tab === 'analytics' && <Analytics />}
          {tab === 'ideas' && <Ideas />}
          {tab === 'insights' && <Insights />}
          {tab === 'generate' && <Generate />}
          {tab === 'calendar' && <Calendar />}
          {tab === 'brandkit' && <BrandKit />}
          {tab === 'comments' && <Comments />}
          {tab === 'competitors' && <Competitors />}
          {tab === 'voice' && <VoiceProfileSettings />}
          {tab === 'settings' && <Settings />}
          {tab === 'assets' && <Assets />}
          {tab === 'apikeys' && <ApiKeys />}
          {tab === 'instructions' && <Instructions />}
        </main>
      </div>

      <AgentChat />
      <Toaster richColors position="bottom-right" />
    </div>
  )
}

import { LayoutDashboard, UploadCloud, Film, Share2, Settings as SettingsIcon, Image as ImageIcon, PawPrint, KeyRound, CalendarClock, TrendingUp, BarChart3, Sparkles, Lightbulb, Target, Wand2, Calendar as CalendarIcon, Palette, Sun, Moon, MessageCircle, Users, Mic, Menu, X, BookOpen } from 'lucide-react'
import { useTheme } from 'next-themes'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-14 h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative flex items-center justify-between w-14 h-7 px-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 cursor-pointer transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 shadow-inner shrink-0"
      aria-label="Toggle theme"
    >
      <div
        className={`absolute w-5 h-5 rounded-full bg-white dark:bg-neutral-900 shadow transition-transform duration-300 ease-out transform ${
          isDark ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
      <Sun className="size-3.5 text-amber-500 z-10 animate-fade-in" />
      <Moon className="size-3.5 text-neutral-400 dark:text-amber-400 z-10 animate-fade-in" />
    </button>
  )
}

function Sidebar({ tab, setTab, className = '', isMobile = false }: { tab: Tab; setTab: (t: Tab) => void; className?: string; isMobile?: boolean }) {
  const items: { id: Tab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'upload', label: 'Upload', icon: UploadCloud },
    { id: 'library', label: 'Library', icon: Film },
    { id: 'ideas', label: 'Ideas', icon: Lightbulb },
    { id: 'generate', label: 'Generate', icon: Wand2 },
    { id: 'social', label: 'Social', icon: Share2 },
    { id: 'scheduled', label: 'Scheduled', icon: CalendarClock },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'insights', label: 'Insights', icon: Target },
    { id: 'comments', label: 'Comments', icon: MessageCircle },
    { id: 'competitors', label: 'Competitors', icon: Users },
    { id: 'brandkit', label: 'Brand Kit', icon: Palette },
    { id: 'voice', label: 'Voice', icon: Mic },
    { id: 'apikeys', label: 'API Keys', icon: KeyRound },
    { id: 'assets', label: 'Assets', icon: ImageIcon },
    { id: 'instructions', label: 'Instructions & FAQ', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ]

  return (
    <div
      className={`flex flex-col bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 ${
        isMobile ? 'h-full w-full' : 'fixed inset-y-0 left-0 w-64'
      } ${className}`}
    >
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center gap-2 px-6 border-b border-neutral-200 dark:border-neutral-800">
        <div className="size-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm">
          <Sparkles className="size-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-none">ContentForge</h1>
          <p className="text-[10px] text-neutral-500 leading-none mt-1">AI Content Automation</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 px-3 py-4 overflow-y-auto no-scrollbar">
        {items.map(item => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-955 dark:hover:text-white'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 shrink-0">
        <div className="text-[10px] text-neutral-400 dark:text-neutral-500 text-center leading-relaxed">
          <div>ContentForge v3 · Self-hosted</div>
          <div className="mt-0.5 text-neutral-300 dark:text-neutral-600">Upload → Score → Publish</div>
        </div>
      </div>
    </div>
  )
}

// === Library ===
function Library() {
  const { data, isLoading } = useQuery({
    queryKey: ['videos'],
    queryFn: async () => (await fetch('/api/videos')).json(),
    refetchInterval: 5000,
  })
  const videos: any[] = data?.videos || []

  if (isLoading) return <div className="text-center py-12 text-neutral-500">Loading library…</div>
  if (videos.length === 0) return (
    <div className="text-center py-24">
      <Film className="size-12 mx-auto text-neutral-300 mb-3" />
      <h2 className="text-lg font-semibold">No videos yet</h2>
      <p className="text-sm text-neutral-500 mt-1">Head to the Upload tab to add your first video.</p>
    </div>
  )

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Video Library</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map(v => <VideoCard key={v.id} v={v} />)}
      </div>
    </div>
  )
}

function VideoCard({ v }: { v: any }) {
  const [open, setOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [repurposing, setRepurposing] = useState(false)
  const queryClient = useQueryClient()
  const statuses: Record<string, string> = {
    pending: 'bg-neutral-100 text-neutral-700',
    editing: 'bg-blue-100 text-blue-700',
    transcribing: 'bg-blue-100 text-blue-700',
    scoring: 'bg-purple-100 text-purple-700',
    ready: 'bg-emerald-100 text-emerald-700',
    publishing: 'bg-amber-100 text-amber-700',
    published: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  }
  const scoreColor = v.viralScore == null ? 'bg-neutral-200' :
    v.viralScore >= 80 ? 'bg-emerald-500 text-white' :
    v.viralScore >= 50 ? 'bg-amber-500 text-white' :
    'bg-red-500 text-white'

  async function repurpose() {
    setRepurposing(true)
    try {
      const res = await fetch(`/api/videos/${v.id}/repurpose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipCount: 5 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(data.message || 'Repurposing started')
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRepurposing(false)
    }
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="aspect-video bg-neutral-100 dark:bg-neutral-800 relative">
        {v.thumbnailUrl ? (
          <img src={v.thumbnailUrl} alt={v.filename} className="size-full object-cover" />
        ) : (
          <div className="size-full flex items-center justify-center text-neutral-300"><Film className="size-8" /></div>
        )}
        {v.viralScore != null && (
          <div className={`absolute top-2 right-2 size-10 rounded-full ${scoreColor} flex items-center justify-center text-sm font-bold`}>
            {v.viralScore}
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statuses[v.status] || 'bg-neutral-100'}`}>
            {v.status}
          </span>
          {v.isClip && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              Clip
            </span>
          )}
        </div>
        {(v.status === 'editing' || v.status === 'transcribing' || v.status === 'scoring') && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-200">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${v.progress}%` }} />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm truncate">{v.aiTitle || v.filename}</h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          {v.durationSec ? `${Math.floor(v.durationSec)}s` : '—'} · {(v.sizeBytes / 1024 / 1024).toFixed(1)} MB
          {v.isClip && v.clipStart != null && ` · from ${Math.floor(v.clipStart)}s`}
        </p>
        {v.aiHashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {v.aiHashtags.slice(0, 4).map((h: string) => (
              <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">#{h}</span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {v.status === 'ready' && (
            <button onClick={() => setOpen(true)} className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              Publish
            </button>
          )}
          {v.status === 'ready' && !v.isClip && v.durationSec > 90 && (
            <button onClick={repurpose} disabled={repurposing} className="px-3 py-1.5 text-xs font-medium rounded-md border border-purple-300 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50">
              {repurposing ? '…' : 'Repurpose'}
            </button>
          )}
          {v.status === 'ready' && (
            <button onClick={() => setTranslateOpen(true)} className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Translate
            </button>
          )}
          {v.status === 'failed' && (
            <button onClick={async () => {
              await fetch(`/api/videos/${v.id}/process`, { method: 'POST' })
              toast.success('Reprocessing started')
              queryClient.invalidateQueries({ queryKey: ['videos'] })
            }} className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500 text-white">
              Retry
            </button>
          )}
          <button onClick={async () => {
            if (!confirm('Delete this video?')) return
            await fetch(`/api/videos/${v.id}`, { method: 'DELETE' })
            queryClient.invalidateQueries({ queryKey: ['videos'] })
          }} className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Delete
          </button>
        </div>
      </div>
      {open && <PublishDialog v={v} onClose={() => setOpen(false)} onPublished={() => queryClient.invalidateQueries({ queryKey: ['videos'] })} />}
      {translateOpen && <TranslateDialog v={v} onClose={() => setTranslateOpen(false)} />}
    </div>
  )
}

function PublishDialog({ v, onClose, onPublished }: { v: any; onClose: () => void; onPublished: () => void }) {
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await fetch('/api/social/accounts')).json(),
  })
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState(v.aiTitle || v.filename)
  const [description, setDescription] = useState(v.aiDescription || '')
  const [hashtags, setHashtags] = useState((v.aiHashtags || []).join(', '))
  const [publishing, setPublishing] = useState(false)
  // NEW: scheduling state
  const [scheduleMode, setScheduleMode] = useState<'now' | 'optimal' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState<string>('')

  const accounts: any[] = accountsData?.accounts || []
  const connected = accounts.filter(a => a.connected)

  async function publish() {
    setPublishing(true)
    try {
      const res = await fetch(`/api/videos/${v.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: selected,
          title,
          description,
          hashtags: hashtags.split(',').map(s => s.trim()).filter(Boolean),
          scheduleMode,
          scheduledAt: scheduleMode === 'schedule' ? scheduledAt : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (scheduleMode === 'now') {
        toast.success(`Publishing to ${selected.length} platform(s)…`)
      } else if (scheduleMode === 'optimal') {
        toast.success(`Scheduled at optimal times for each platform ✓`)
      } else {
        toast.success(`Scheduled for ${new Date(scheduledAt).toLocaleString()} ✓`)
      }
      onPublished()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  // Get suggested optimal times for display
  const getOptimalPreview = () => {
    const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000)
    return next24h.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">Publish Video</h3>
        <div className="space-y-3">
          <div className="aspect-video bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden">
            {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="size-full object-cover" />}
          </div>
          {v.processedUrl && (
            <video src={v.processedUrl} controls className="w-full rounded-lg max-h-60 bg-black" />
          )}
          {/* NEW: formats badge */}
          {v.formats?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {v.formats.map((f: string) => (
                <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-mono">
                  ✓ {f}
                </span>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Hashtags (comma separated)</label>
            <input value={hashtags} onChange={e => setHashtags(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">Publish to</label>
            {connected.length === 0 ? (
              <p className="text-sm text-amber-600">No connected accounts. Go to Social Accounts tab to connect.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {connected.map(a => {
                  const checked = selected.includes(a.platform)
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelected(prev => checked ? prev.filter(p => p !== a.platform) : [...prev, a.platform])}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm border ${checked ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-neutral-200 dark:border-neutral-800'}`}
                    >
                      <span className="capitalize">{a.platform}</span>
                      <span className="text-xs text-neutral-500 truncate">@{a.handle}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {/* NEW: scheduling section */}
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">When to publish</label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {(['now', 'optimal', 'schedule'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setScheduleMode(mode)}
                  className={`px-3 py-2 rounded-md text-xs font-medium border ${scheduleMode === mode ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'border-neutral-200 dark:border-neutral-800'}`}
                >
                  {mode === 'now' ? 'Publish now' : mode === 'optimal' ? 'Optimal times' : 'Pick time'}
                </button>
              ))}
            </div>
            {scheduleMode === 'optimal' && (
              <p className="text-xs text-neutral-500">
                Each platform will be scheduled at its next optimal time (e.g. YouTube 3pm ET, TikTok 7pm ET, Instagram 11am/2pm/7pm ET).
                Next available slot: around {getOptimalPreview()}.
              </p>
            )}
            {scheduleMode === 'schedule' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm"
              />
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 text-sm font-medium">Cancel</button>
            <button
              onClick={publish}
              disabled={publishing || selected.length === 0 || (scheduleMode === 'schedule' && !scheduledAt)}
              className="flex-1 px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
            >
              {publishing
                ? 'Working…'
                : scheduleMode === 'now'
                  ? `Publish to ${selected.length}`
                  : scheduleMode === 'optimal'
                    ? `Schedule optimal`
                    : `Schedule post`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TranslateDialog({ v, onClose }: { v: any; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['translate', v.id],
    queryFn: async () => (await fetch(`/api/videos/${v.id}/translate`)).json(),
  })
  const [selected, setSelected] = useState<string[]>([])
  const [translating, setTranslating] = useState(false)

  const languages: { code: string; name: string }[] = data?.supportedLanguages || []
  const translations: Record<string, string> = data?.translations || {}

  async function translate() {
    setTranslating(true)
    try {
      const res = await fetch(`/api/videos/${v.id}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ languages: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`Translated to ${data.translated} language(s)`)
      queryClient.invalidateQueries({ queryKey: ['translate', v.id] })
      setSelected([])
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setTranslating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">Translate Caption</h3>
        <p className="text-xs text-neutral-500 mb-4">Translate "{v.aiTitle || v.filename}" caption to reach international audiences.</p>

        {isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            {Object.keys(translations).length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold text-neutral-500 uppercase">Existing translations</p>
                {Object.entries(translations).map(([lang, text]) => {
                  const langName = languages.find(l => l.code === lang)?.name || lang
                  return (
                    <div key={lang} className="p-2 rounded-md bg-neutral-50 dark:bg-neutral-950">
                      <p className="text-xs font-semibold">{langName}</p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{(text as string).slice(0, 150)}{(text as string).length > 150 ? '…' : ''}</p>
                    </div>
                  )
                })}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">Select languages to translate</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {languages.map(lang => {
                  const checked = selected.includes(lang.code)
                  const has = translations[lang.code]
                  return (
                    <button
                      key={lang.code}
                      onClick={() => setSelected(prev => checked ? prev.filter(l => l !== lang.code) : [...prev, lang.code])}
                      className={`px-3 py-2 rounded-md text-xs font-medium border text-left ${checked ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'border-neutral-200 dark:border-neutral-800'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{lang.name}</span>
                        {has && <span className="text-[9px] text-emerald-600">✓</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button onClick={onClose} className="flex-1 px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 text-sm font-medium">Close</button>
              <button
                onClick={translate}
                disabled={translating || selected.length === 0}
                className="flex-1 px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
              >
                {translating ? 'Translating…' : `Translate to ${selected.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// === Social Accounts ===
function SocialAccounts({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await fetch('/api/social/accounts')).json(),
  })
  const accounts: any[] = data?.accounts || []
  const platformStatus: Record<string, boolean> = data?.platformStatus || {}
  const platforms = ['youtube', 'tiktok', 'instagram', 'facebook', 'x']

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Social Media Accounts</h2>
      <p className="text-sm text-neutral-500 mb-4">Connect your accounts to enable one-click publishing. You'll need to add API keys first.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {platforms.map(p => {
          const acct = accounts.find(a => a.platform === p && a.connected)
          const configured = platformStatus[p]
          return (
            <div key={p} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium capitalize">{p}</p>
                    {configured ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">API Ready</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Needs Keys</span>
                    )}
                  </div>
                  {acct ? (
                    <p className="text-xs text-neutral-500 mt-0.5">@{acct.handle} · {acct.displayName}</p>
                  ) : (
                    <p className="text-xs text-neutral-500 mt-0.5">Not connected</p>
                  )}
                </div>
                {acct ? (
                  <button
                    onClick={async () => {
                      await fetch('/api/social/accounts', { method: 'DELETE', body: JSON.stringify({ id: acct.id }), headers: { 'Content-Type': 'application/json' } })
                      refetch()
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Disconnect
                  </button>
                ) : configured ? (
                  <a href={`/api/social/connect/${p}`} className="px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                    Connect
                  </a>
                ) : (
                  <button onClick={() => onNavigate('apikeys')} className="px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 text-amber-700 dark:text-amber-300">
                    Add Keys
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200 text-sm">How to set up</h3>
        <ol className="text-sm text-blue-800 dark:text-blue-100 mt-2 space-y-1 list-decimal list-inside">
          <li>Go to <button onClick={() => onNavigate('apikeys')} className="underline font-medium">API Keys tab</button> and add credentials for each platform you want to publish to.</li>
          <li>Each platform's developer portal link is shown next to its fields. Create an app there to get the keys.</li>
          <li>Set the OAuth Redirect URL in each platform's settings to: <code className="text-xs px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 break-all">{typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com'}/api/social/callback/[platform]</code></li>
          <li>Come back here and click <strong>Connect</strong> — you'll be redirected to the platform's login page.</li>
        </ol>
        <p className="text-xs mt-3 text-blue-700 dark:text-blue-300">
          Note: Instagram &amp; Facebook require videos hosted on a public URL (S3, Cloudinary, etc.) for publishing. YouTube, TikTok, and X support direct file upload.
        </p>
      </div>
    </div>
  )
}

// === Scheduled ===
function Scheduled() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['scheduled-posts'],
    queryFn: async () => (await fetch('/api/posts/scheduled')).json(),
    refetchInterval: 15000, // refresh every 15s so scheduled posts show as published when they go live
  })
  const queryClient = useQueryClient()
  const posts: any[] = data?.posts || []

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    uploading: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    pending: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
    published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  }

  if (isLoading) {
    return <div className="text-center py-12 text-neutral-500">Loading scheduled posts…</div>
  }

  // Group posts
  const scheduled = posts.filter(p => p.status === 'scheduled')
  const inProgress = posts.filter(p => p.status === 'uploading' || p.status === 'pending')
  const recentlyPublished = posts.filter(p => p.status === 'published')
  const failed = posts.filter(p => p.status === 'failed')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Scheduled Posts</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Posts go live automatically at their scheduled time. Vercel Cron checks every minute — make sure <code>CRON_SECRET</code> is set.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-2xl font-bold text-blue-600">{scheduled.length}</p>
          <p className="text-xs text-neutral-500">Scheduled</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-2xl font-bold text-amber-600">{inProgress.length}</p>
          <p className="text-xs text-neutral-500">In progress</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-2xl font-bold text-emerald-600">{recentlyPublished.length}</p>
          <p className="text-xs text-neutral-500">Published (24h)</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-2xl font-bold text-red-600">{failed.length}</p>
          <p className="text-xs text-neutral-500">Failed (24h)</p>
        </div>
      </div>

      {/* Scheduled list */}
      {scheduled.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Upcoming</h3>
          <div className="space-y-2">
            {scheduled.map(p => (
              <ScheduledPostCard key={p.id} p={p} statusColor={statusColors[p.status]} onCancel={async () => {
                await fetch('/api/posts/scheduled', { method: 'DELETE', body: JSON.stringify({ id: p.id }), headers: { 'Content-Type': 'application/json' } })
                toast.success('Scheduled post cancelled')
                refetch()
                queryClient.invalidateQueries({ queryKey: ['videos'] })
              }} />
            ))}
          </div>
        </div>
      )}

      {inProgress.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Publishing now</h3>
          <div className="space-y-2">
            {inProgress.map(p => (
              <ScheduledPostCard key={p.id} p={p} statusColor={statusColors[p.status]} />
            ))}
          </div>
        </div>
      )}

      {failed.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Recently failed</h3>
          <div className="space-y-2">
            {failed.map(p => (
              <ScheduledPostCard key={p.id} p={p} statusColor={statusColors[p.status]} />
            ))}
          </div>
        </div>
      )}

      {recentlyPublished.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Recently published</h3>
          <div className="space-y-2">
            {recentlyPublished.map(p => (
              <ScheduledPostCard key={p.id} p={p} statusColor={statusColors[p.status]} />
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 && (
        <div className="text-center py-16">
          <CalendarClock className="size-12 mx-auto text-neutral-300 mb-3" />
          <h3 className="font-semibold">No scheduled posts yet</h3>
          <p className="text-sm text-neutral-500 mt-1">Publish a video and choose "Optimal times" or "Pick time" to schedule it.</p>
        </div>
      )}
    </div>
  )
}

function ScheduledPostCard({ p, statusColor, onCancel }: { p: any; statusColor: string; onCancel?: () => void }) {
  const statusLabels: Record<string, string> = {
    scheduled: 'Scheduled',
    uploading: 'Publishing…',
    pending: 'Queued',
    published: 'Published',
    failed: 'Failed',
  }
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex items-center gap-3">
      {p.video?.thumbnailUrl ? (
        <img src={p.video.thumbnailUrl} alt="" className="size-12 rounded object-cover" />
      ) : (
        <div className="size-12 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-300">
          <Film className="size-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{p.title || p.video?.aiTitle || p.video?.filename}</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor}`}>{statusLabels[p.status] || p.status}</span>
        </div>
        <p className="text-xs text-neutral-500 mt-0.5">
          <span className="capitalize">{p.platform}</span> · @{p.account?.handle}
          {p.scheduledAt && p.status === 'scheduled' && (
            <> · 📅 {new Date(p.scheduledAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</>
          )}
          {p.publishedAt && p.status === 'published' && (
            <> · ✅ {new Date(p.publishedAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}</>
          )}
          {p.status === 'published' && p.platformUrl && (
            <> · <a href={p.platformUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a></>
          )}
          {p.status === 'failed' && p.errorMessage && (
            <> · <span className="text-red-500">{p.errorMessage.slice(0, 80)}</span></>
          )}
        </p>
      </div>
      {p.status === 'scheduled' && onCancel && (
        <button onClick={onCancel} className="text-xs text-red-600 hover:underline">Cancel</button>
      )}
    </div>
  )
}

// === Settings ===
function Settings() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await fetch('/api/settings')).json(),
  })
  const settings: Record<string, string> = data?.settings || {}
  
  const [brandHandle, setBrandHandle] = useState(settings['brand.handle'] || '@yourhandle')
  const [niche, setNiche] = useState(settings['content.niche'] || 'dog / pet content')
  
  const [provider, setProvider] = useState(settings['llm.provider'] || 'zai')
  const [openrouterModel, setOpenrouterModel] = useState(settings['llm.openrouter.model'] || 'meta-llama/llama-3.1-8b-instruct:free')
  const [openaiModel, setOpenaiModel] = useState(settings['llm.openai.model'] || 'gpt-4o-mini')
  const [geminiModel, setGeminiModel] = useState(settings['llm.gemini.model'] || 'gemini-1.5-flash')
  
  const [ideationModel, setIdeationModel] = useState(settings['llm.model.ideation'] || '')
  const [scriptsModel, setScriptsModel] = useState(settings['llm.model.scripts'] || '')
  const [analysisModel, setAnalysisModel] = useState(settings['llm.model.analysis'] || '')
  
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setBrandHandle(settings['brand.handle'] || '@yourhandle')
      setNiche(settings['content.niche'] || 'dog / pet content')
      setProvider(settings['llm.provider'] || 'zai')
      setOpenrouterModel(settings['llm.openrouter.model'] || 'meta-llama/llama-3.1-8b-instruct:free')
      setOpenaiModel(settings['llm.openai.model'] || 'gpt-4o-mini')
      setGeminiModel(settings['llm.gemini.model'] || 'gemini-1.5-flash')
      setIdeationModel(settings['llm.model.ideation'] || '')
      setScriptsModel(settings['llm.model.scripts'] || '')
      setAnalysisModel(settings['llm.model.analysis'] || '')
    }
  }, [isLoading, data])

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { id: 'brand.handle', value: brandHandle },
            { id: 'content.niche', value: niche },
            { id: 'llm.provider', value: provider },
            { id: 'llm.openrouter.model', value: openrouterModel },
            { id: 'llm.openai.model', value: openaiModel },
            { id: 'llm.gemini.model', value: geminiModel },
            { id: 'llm.model.ideation', value: ideationModel },
            { id: 'llm.model.scripts', value: scriptsModel },
            { id: 'llm.model.analysis', value: analysisModel },
          ],
        }),
      })
      toast.success('Settings saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-xs text-neutral-500 mt-1">Configure your brand identity and model behaviors.</p>
      </div>

      <div className="space-y-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h3 className="text-sm font-semibold border-b border-neutral-100 dark:border-neutral-800 pb-2">Brand Info</h3>
        <div>
          <label className="text-sm font-medium">Brand Handle</label>
          <p className="text-xs text-neutral-500 mt-0.5">Used in AI-generated captions and taglines.</p>
          <input value={brandHandle} onChange={e => setBrandHandle(e.target.value)} className="w-full mt-2 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium">Content Niche</label>
          <p className="text-xs text-neutral-500 mt-0.5">Tells the AI what kind of content you make.</p>
          <input value={niche} onChange={e => setNiche(e.target.value)} className="w-full mt-2 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
        </div>
      </div>

      <div className="space-y-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h3 className="text-sm font-semibold border-b border-neutral-100 dark:border-neutral-800 pb-2">AI Language Model Configuration</h3>
        
        <div>
          <label className="text-sm font-medium">Default AI Provider</label>
          <p className="text-xs text-neutral-500 mt-0.5">Select which LLM backend API to query. (Note: make sure to enter keys in the API Keys tab).</p>
          <select value={provider} onChange={e => setProvider(e.target.value)} className="w-full mt-2 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
            <option value="zai">Sandbox (ZAI - No keys required)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="openrouter">OpenRouter (DeepSeek, Llama, Nemotron)</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>

        {provider === 'openai' && (
          <div>
            <label className="text-sm font-medium">Default OpenAI Model</label>
            <input value={openaiModel} onChange={e => setOpenaiModel(e.target.value)} className="w-full mt-2 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" placeholder="e.g. gpt-4o-mini" />
          </div>
        )}

        {provider === 'openrouter' && (
          <div>
            <label className="text-sm font-medium">Default OpenRouter Model</label>
            <p className="text-xs text-neutral-500 mt-0.5">Type any model ID supported by OpenRouter.</p>
            <input value={openrouterModel} onChange={e => setOpenrouterModel(e.target.value)} className="w-full mt-2 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" placeholder="e.g. meta-llama/llama-3.1-8b-instruct:free" />
          </div>
        )}

        {provider === 'gemini' && (
          <div>
            <label className="text-sm font-medium">Default Gemini Model</label>
            <input value={geminiModel} onChange={e => setGeminiModel(e.target.value)} className="w-full mt-2 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" placeholder="e.g. gemini-1.5-flash" />
          </div>
        )}

        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-4">
          <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Task-Specific Model Overrides (Optional)</h4>
          <p className="text-[11px] text-neutral-500 leading-relaxed">Leave empty to use your default provider model. Perfect for selecting specialized task models (e.g., DeepSeek for ideation, Nemotron for scriptwriting).</p>
          
          <div>
            <label className="text-xs font-medium">Ideation Model Override (e.g. Ideas Generator)</label>
            <input value={ideationModel} onChange={e => setIdeationModel(e.target.value)} className="w-full mt-1.5 px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-xs" placeholder="e.g. deepseek/deepseek-chat or gpt-4o" />
          </div>

          <div>
            <label className="text-xs font-medium">Scriptwriting Model Override (Voiceover scripts)</label>
            <input value={scriptsModel} onChange={e => setScriptsModel(e.target.value)} className="w-full mt-1.5 px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-xs" placeholder="e.g. nvidia/llama-3.1-nemotron-70b-instruct" />
          </div>

          <div>
            <label className="text-xs font-medium">Video Analysis &amp; Viral Scoring Model Override</label>
            <input value={analysisModel} onChange={e => setAnalysisModel(e.target.value)} className="w-full mt-1.5 px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-xs" placeholder="e.g. google/gemini-pro-1.5 or gpt-4o" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving ? 'Saving…' : 'Save Configurations'}
        </button>
      </div>
    </div>
  )
}

// === Assets ===
function Assets() {
  const { data, refetch } = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await fetch('/api/assets')).json(),
  })
  const assets: any[] = data?.assets || []
  const [uploading, setUploading] = useState(false)

  async function upload(file: File, type: string) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', type)
      fd.append('name', file.name)
      const res = await fetch('/api/assets', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      toast.success(`${type} uploaded`)
      refetch()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  const types = [
    { id: 'watermark', label: 'Watermark (PNG with transparency)', accept: 'image/png' },
    { id: 'intro', label: 'Intro Clip (MP4)', accept: 'video/mp4' },
    { id: 'outro', label: 'Outro Clip (MP4)', accept: 'video/mp4' },
    { id: 'music', label: 'Background Music (MP3)', accept: 'audio/mpeg' },
  ]

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Assets</h2>
      <p className="text-sm text-neutral-500 mb-6">Upload reusable assets like watermarks, intro/outro clips, and background music.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {types.map(t => (
          <label key={t.id} className="block">
            <span className="text-sm font-medium">{t.label}</span>
            <input
              type="file"
              accept={t.accept}
              className="block mt-1 w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-neutral-900 file:text-white dark:file:bg-white dark:file:text-neutral-900"
              onChange={e => e.target.files?.[0] && upload(e.target.files[0], t.id)}
              disabled={uploading}
            />
          </label>
        ))}
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs uppercase text-neutral-500">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">Uploaded</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-neutral-500">No assets uploaded yet</td></tr>
            ) : (
              assets.map(a => (
                <tr key={a.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="p-3 font-medium">{a.name}</td>
                  <td className="p-3 capitalize">{a.type}</td>
                  <td className="p-3">{(a.sizeBytes / 1024 / 1024).toFixed(2)} MB</td>
                  <td className="p-3 text-neutral-500">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="p-3 text-right">
                    <button onClick={async () => {
                      await fetch('/api/assets', { method: 'DELETE', body: JSON.stringify({ id: a.id }), headers: { 'Content-Type': 'application/json' } })
                      refetch()
                    }} className="text-red-600 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
