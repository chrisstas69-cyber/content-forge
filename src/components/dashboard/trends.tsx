'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TrendingUp, RefreshCw, Loader2, ExternalLink, Hash, Music, Video, Lightbulb } from 'lucide-react'
import { useState } from 'react'

export function Trends() {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [platformFilter, setPlatformFilter] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['trends'],
    queryFn: async () => (await fetch('/api/trends')).json(),
  })

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/trends/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Refresh failed')
      toast.success(`Found ${data.discovered} trends, saved ${data.saved} new`)
      queryClient.invalidateQueries({ queryKey: ['trends'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const byPlatform = (data?.byPlatform || {}) as Record<string, any[]>
  const platforms = Object.keys(byPlatform).filter(p => !platformFilter || p === platformFilter)
  const total = Object.values(byPlatform).flat().length

  const typeIcons: Record<string, any> = {
    hashtag: Hash,
    sound: Music,
    format: Video,
    topic: Lightbulb,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">Trending in your niche</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Niche: <strong className="text-neutral-700 dark:text-neutral-300">{data?.niche || 'pet content'}</strong> · {total} trends discovered
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {refreshing ? 'Searching web…' : 'Refresh trends'}
        </button>
      </div>

      {/* Platform filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setPlatformFilter('')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${!platformFilter ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'border border-neutral-200 dark:border-neutral-800'}`}
        >
          All platforms
        </button>
        {Object.keys(byPlatform).map(p => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize ${platformFilter === p ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'border border-neutral-200 dark:border-neutral-800'}`}
          >
            {p} ({byPlatform[p].length})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
      ) : total === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <TrendingUp className="size-12 mx-auto text-neutral-300 mb-3" />
          <h3 className="font-semibold">No trends yet</h3>
          <p className="text-sm text-neutral-500 mt-1 mb-4">Click "Refresh trends" to search the web for what's hot in your niche.</p>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium"
          >
            <RefreshCw className="size-4" /> Search now
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {platforms.map(platform => {
            const trends = byPlatform[platform] || []
            if (trends.length === 0) return null
            return (
              <div key={platform} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800">
                  <h3 className="font-semibold text-sm capitalize">{platform}</h3>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {trends.map((t, i) => {
                    const Icon = typeIcons[t.type] || Hash
                    return (
                      <div key={t.id || i} className="p-4 flex items-start gap-3">
                        <div className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          t.score >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                          t.score >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                          'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
                        }`}>
                          <Icon className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{t.content}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 uppercase">{t.type}</span>
                          </div>
                          {t.summary && <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{t.summary}</p>}
                          <p className="text-[10px] text-neutral-400 mt-1">
                            Score: {t.score}/100 · {new Date(t.freshness).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
