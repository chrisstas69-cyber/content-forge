'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BarChart3, RefreshCw, Loader2, Eye, Heart, MessageCircle, Share2, TrendingUp } from 'lucide-react'
import { useState } from 'react'

export function Analytics() {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => (await fetch('/api/analytics')).json(),
    refetchInterval: 60000,
  })

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/analytics/refresh', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Refresh failed')
      toast.success(`Refreshed ${data.refreshed} posts, ${data.failed} failed`)
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
  }

  const totals = data?.totals || { views: 0, likes: 0, comments: 0, shares: 0, posts: 0 }
  const perPlatform = data?.perPlatform || {}
  const topVideos = data?.topVideos || []

  const cards = [
    { label: 'Total Views', value: totals.views, icon: Eye, color: 'bg-blue-500' },
    { label: 'Total Likes', value: totals.likes, icon: Heart, color: 'bg-red-500' },
    { label: 'Comments', value: totals.comments, icon: MessageCircle, color: 'bg-purple-500' },
    { label: 'Shares', value: totals.shares, icon: Share2, color: 'bg-emerald-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">Analytics</h2>
          <p className="text-sm text-neutral-500 mt-1">Cross-platform performance for {totals.posts} published posts</p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {refreshing ? 'Refreshing…' : 'Refresh metrics'}
        </button>
      </div>

      {totals.posts === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <BarChart3 className="size-12 mx-auto text-neutral-300 mb-3" />
          <h3 className="font-semibold">No analytics yet</h3>
          <p className="text-sm text-neutral-500 mt-1">Publish some videos first, then refresh to see view/like/comment metrics across platforms.</p>
        </div>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cards.map(c => {
              const Icon = c.icon
              return (
                <div key={c.label} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
                  <div className={`size-8 rounded-lg ${c.color} text-white flex items-center justify-center mb-2`}>
                    <Icon className="size-4" />
                  </div>
                  <p className="text-2xl font-bold">{formatNum(c.value)}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{c.label}</p>
                </div>
              )
            })}
          </div>

          {/* Per-platform breakdown */}
          {Object.keys(perPlatform).length > 0 && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
              <h3 className="font-semibold mb-3">Per-Platform Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(perPlatform).map(([platform, p]: [string, any]) => (
                  <div key={platform}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium capitalize">{platform}</span>
                      <span className="text-neutral-500">{p.posts} posts · {formatNum(p.views)} views</span>
                    </div>
                    <div className="flex gap-3 text-xs text-neutral-600 dark:text-neutral-400">
                      <span>❤️ {formatNum(p.likes)}</span>
                      <span>💬 {formatNum(p.comments)}</span>
                      <span>↗ {formatNum(p.shares)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top videos */}
          {topVideos.length > 0 && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800">
                <h3 className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="size-4" /> Top Performing Videos</h3>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {topVideos.map((v, i) => (
                  <div key={v.id} className="p-3 flex items-center gap-3">
                    <div className="size-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500">
                      {i + 1}
                    </div>
                    {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="size-12 rounded object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      <div className="flex gap-3 text-xs text-neutral-500 mt-0.5">
                        <span><Eye className="size-3 inline" /> {formatNum(v.views)}</span>
                        <span>❤️ {formatNum(v.likes)}</span>
                        <span>💬 {formatNum(v.comments)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function formatNum(n: number | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}
