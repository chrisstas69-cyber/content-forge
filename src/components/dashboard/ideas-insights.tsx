'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Lightbulb, Loader2, Sparkles, Trash2, TrendingUp, Target, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

export function Ideas() {
  const queryClient = useQueryClient()
  const [generating, setGenerating] = useState(false)
  const [implementingId, setImplementingId] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ideas'],
    queryFn: async () => (await fetch('/api/ideas')).json(),
  })

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 5 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      toast.success(`Generated ${data.generated} new ideas!`)
      refetch()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function saveIdea(id: string) {
    try {
      const res = await fetch(`/api/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'saved' }),
      })
      if (!res.ok) throw new Error()
      toast.success('Idea saved for later!')
      refetch()
    } catch {
      toast.error('Failed to save idea')
    }
  }

  async function implementIdea(id: string) {
    setImplementingId(id)
    try {
      const res = await fetch(`/api/ideas/${id}/implement`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to implement idea')
      toast.success('Draft video project created in Library!')
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setImplementingId(null)
    }
  }

  async function rejectIdea(id: string) {
    await fetch(`/api/ideas/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }), headers: { 'Content-Type': 'application/json' } })
    refetch()
  }

  async function deleteIdea(id: string) {
    await fetch(`/api/ideas/${id}`, { method: 'DELETE' })
    refetch()
  }

  const ideas: any[] = data?.ideas || []
  const newIdeas = ideas.filter(i => i.status === 'new')
  const savedIdeas = ideas.filter(i => i.status === 'saved')
  const usedIdeas = ideas.filter(i => i.status === 'used')
  const rejectedIdeas = ideas.filter(i => i.status === 'rejected')

  const sourceIcons: Record<string, any> = {
    trends: TrendingUp,
    insights: Target,
    analytics: CheckCircle2,
    manual: Lightbulb,
    competitor: AlertCircle,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">Content Ideas</h2>
          <p className="text-sm text-neutral-500 mt-1">AI-generated ideas based on trends, your analytics, and performance insights.</p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generating ? 'Generating…' : 'Generate 5 ideas'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
      ) : newIdeas.length === 0 && savedIdeas.length === 0 && usedIdeas.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <Lightbulb className="size-12 mx-auto text-neutral-300 mb-3" />
          <h3 className="font-semibold">No ideas yet</h3>
          <p className="text-sm text-neutral-500 mt-1 mb-4">Click "Generate 5 ideas" to get AI-powered content suggestions tailored to your niche.</p>
        </div>
      ) : (
        <>
          {newIdeas.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3">Fresh ideas ({newIdeas.length})</h3>
              <div className="space-y-3">
                {newIdeas.map(idea => {
                  const Icon = sourceIcons[idea.source] || Lightbulb
                  return (
                    <div key={idea.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 flex items-center justify-center">
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm">{idea.title}</h4>
                            <p className="text-[10px] text-neutral-500 capitalize">{idea.source} · {idea.format}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${idea.predictedViralScore >= 80 ? 'text-emerald-600' : idea.predictedViralScore >= 60 ? 'text-amber-600' : 'text-neutral-500'}`}>
                            {idea.predictedViralScore}
                          </div>
                          <p className="text-[10px] text-neutral-500">viral score</p>
                        </div>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">{idea.concept}</p>
                      {idea.scriptOutline && (
                        <div className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-950 rounded-lg">
                          <p className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">Script outline</p>
                          <p className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{idea.scriptOutline}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                        <button onClick={() => deleteIdea(idea.id)} className="text-xs text-neutral-400 hover:text-red-500 transition-colors">Dismiss</button>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => saveIdea(idea.id)} 
                            className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                          >
                            Save for Later
                          </button>
                          <button 
                            onClick={() => implementIdea(idea.id)} 
                            disabled={implementingId === idea.id}
                            className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors inline-flex items-center gap-1"
                          >
                            {implementingId === idea.id && <Loader2 className="size-3 animate-spin" />}
                            Implement Now
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {savedIdeas.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500"></span>
                Saved Ideas ({savedIdeas.length})
              </h3>
              <div className="space-y-3">
                {savedIdeas.map(idea => {
                  const Icon = sourceIcons[idea.source] || Lightbulb
                  return (
                    <div key={idea.id} className="bg-emerald-50/10 dark:bg-emerald-950/5 rounded-xl border border-emerald-200/50 dark:border-emerald-800/30 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm">{idea.title}</h4>
                            <p className="text-[10px] text-neutral-500 capitalize">{idea.source} · {idea.format}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-emerald-600">
                            {idea.predictedViralScore}
                          </div>
                          <p className="text-[10px] text-neutral-500">viral score</p>
                        </div>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">{idea.concept}</p>
                      {idea.scriptOutline && (
                        <div className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-950 rounded-lg">
                          <p className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">Script outline</p>
                          <p className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{idea.scriptOutline}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                        <button onClick={() => deleteIdea(idea.id)} className="text-xs text-neutral-400 hover:text-red-500 transition-colors">Dismiss</button>
                        <button 
                          onClick={() => implementIdea(idea.id)} 
                          disabled={implementingId === idea.id}
                          className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors inline-flex items-center gap-1"
                        >
                          {implementingId === idea.id && <Loader2 className="size-3 animate-spin" />}
                          Implement Now
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {usedIdeas.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3 text-neutral-500">Used ideas ({usedIdeas.length})</h3>
              <div className="space-y-2">
                {usedIdeas.map(idea => (
                  <div key={idea.id} className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-100 dark:border-neutral-800 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium line-through opacity-60">{idea.title}</p>
                      <p className="text-[10px] text-neutral-400">Used</p>
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

export function Insights() {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: async () => (await fetch('/api/insights')).json(),
  })

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/insights/refresh', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`Generated ${data.generated} insights`)
      queryClient.invalidateQueries({ queryKey: ['insights'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const insights: any[] = data?.insights || []

  const typeConfig: Record<string, { icon: any; color: string; label: string }> = {
    pattern: { icon: TrendingUp, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', label: 'Pattern' },
    opportunity: { icon: Target, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', label: 'Opportunity' },
    underperformer: { icon: AlertCircle, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', label: 'Underperformer' },
    recommendation: { icon: Lightbulb, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: 'Recommendation' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">Insights</h2>
          <p className="text-sm text-neutral-500 mt-1">AI-analyzed patterns from your actual performance data. Feeds into idea generation.</p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {refreshing ? 'Analyzing…' : 'Refresh insights'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
      ) : insights.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <Target className="size-12 mx-auto text-neutral-300 mb-3" />
          <h3 className="font-semibold">No insights yet</h3>
          <p className="text-sm text-neutral-500 mt-1 mb-4">Publish videos and refresh analytics first, then click "Refresh insights" to analyze your performance patterns.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map(ins => {
            const cfg = typeConfig[ins.type] || typeConfig.recommendation
            const Icon = cfg.icon
            return (
              <div key={ins.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex items-start gap-3">
                <div className={`size-8 rounded-lg ${cfg.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[10px] text-neutral-400">Confidence: {ins.confidence}%</span>
                  </div>
                  <p className="text-sm">{ins.content}</p>
                  {ins.data && Object.keys(ins.data).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-neutral-400 cursor-pointer">view data</summary>
                      <pre className="text-[10px] text-neutral-500 mt-1 bg-neutral-50 dark:bg-neutral-950 p-2 rounded overflow-x-auto">{JSON.stringify(ins.data, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
