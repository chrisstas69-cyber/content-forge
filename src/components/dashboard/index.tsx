'use client'

import { useQuery } from '@tanstack/react-query'
import { Film, Loader2, TrendingUp, CheckCircle2, XCircle, Clock, Share2, CalendarClock, Layers } from 'lucide-react'

type Tab = 'dashboard' | 'upload' | 'library' | 'social' | 'settings' | 'assets' | 'apikeys' | 'scheduled'

export function Dashboard({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => (await fetch('/api/dashboard/stats')).json(),
    refetchInterval: 5000,
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
  }

  const s = stats || {}
  const cards = [
    { label: 'Total Videos', value: s.total || 0, icon: Film, color: 'bg-neutral-500' },
    { label: 'Processing', value: s.processing || 0, icon: Clock, color: 'bg-blue-500' },
    { label: 'Ready', value: s.ready || 0, icon: CheckCircle2, color: 'bg-emerald-500' },
    { label: 'Scheduled', value: s.scheduled || 0, icon: CalendarClock, color: 'bg-orange-500' },
    { label: 'Published', value: s.published || 0, icon: Share2, color: 'bg-purple-500' },
    { label: 'Avg Viral Score', value: s.avgViralScore || 0, icon: TrendingUp, color: 'bg-amber-500' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Welcome back 👋</h2>
        <p className="text-sm text-neutral-500">Your dog content automation hub. Upload videos and let the system handle editing, scoring, and publishing.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
              <div className={`size-8 rounded-lg ${c.color} text-white flex items-center justify-center mb-2`}>
                <Icon className="size-4" />
              </div>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{c.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h3 className="font-semibold mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button onClick={() => onNavigate('upload')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-orange-500 text-white text-sm font-medium">
              <span>Upload new videos</span>
              <span>→</span>
            </button>
            <button onClick={() => onNavigate('library')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <span>View video library</span>
              <span>→</span>
            </button>
            <button onClick={() => onNavigate('social')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <span>Connect social accounts</span>
              <span>→</span>
            </button>
            <button onClick={() => onNavigate('scheduled')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <span>View scheduled posts</span>
              <span>→</span>
            </button>
            <button onClick={() => onNavigate('apikeys')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40">
              <span>Add API Keys (required for publishing)</span>
              <span>→</span>
            </button>
            <button onClick={() => onNavigate('assets')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <span>Upload watermark / music / intros</span>
              <span>→</span>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h3 className="font-semibold mb-3">Connected Accounts</h3>
          {s.connectedAccounts === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-neutral-500 mb-3">No accounts connected yet.</p>
              <button onClick={() => onNavigate('social')} className="px-4 py-2 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium">
                Connect now
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{s.connectedAccounts} account(s) connected</p>
              <div className="space-y-1">
                {Object.entries(s.accountsByPlatform || {}).map(([p, count]) => (
                  <div key={p} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{p}</span>
                    <span className="text-neutral-500">{count as number} connected</span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500">
                Total posts published: <strong className="text-neutral-900 dark:text-neutral-100">{s.publishedPosts || 0}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-xl border border-orange-200 dark:border-orange-900 p-5">
        <h3 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">How it works</h3>
        <ol className="text-sm text-orange-900 dark:text-orange-100 space-y-1 list-decimal list-inside">
          <li><strong>Upload</strong> raw dog videos via the Upload tab.</li>
          <li>The system <strong>transcribes</strong> audio with AI and generates burned-in captions.</li>
          <li>FFmpeg applies your <strong>watermark, music, intro/outro</strong>, and edits automatically.</li>
          <li>AI analyzes the content and gives it a <strong>viral score (0–100)</strong>.</li>
          <li><strong>3 formats auto-generated</strong> — vertical (9:16), horizontal (16:9), and square (1:1) for every platform.</li>
          <li>Review, then <strong>publish now</strong> or <strong>schedule at optimal times</strong> — one click to all platforms.</li>
        </ol>
      </div>
    </div>
  )
}
