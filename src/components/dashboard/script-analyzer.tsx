'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Search, Layers, Sparkles, Trash2, Save, Wand2, TrendingUp } from 'lucide-react'
import { useState } from 'react'

export function ScriptAnalyzer() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [url, setUrl] = useState('')
  const [bulkUrls, setBulkUrls] = useState('')
  const [adaptForNiche, setAdaptForNiche] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['analyzed-scripts'],
    queryFn: async () => (await fetch('/api/analyze')).json(),
  })

  const { data: bulkData } = useQuery({
    queryKey: ['bulk-results'],
    queryFn: async () => {
      const stored = sessionStorage.getItem('bulkResults')
      return stored ? JSON.parse(stored) : null
    },
  })

  async function analyze() {
    setAnalyzing(true)
    try {
      if (mode === 'single') {
        if (!url.trim()) {
          toast.error('Enter a video URL')
          return
        }
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim(), adaptForNiche }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Analysis failed')
        toast.success(`Analyzed! Viral score: ${data.analysis.viralScore}`)
        queryClient.invalidateQueries({ queryKey: ['analyzed-scripts'] })
        setUrl('')
      } else {
        const urls = bulkUrls.split('\n').map(u => u.trim()).filter(Boolean)
        if (urls.length === 0) {
          toast.error('Enter at least one URL')
          return
        }
        const res = await fetch('/api/analyze/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls, adaptForNiche }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Bulk analysis failed')
        toast.success(`Analyzed ${data.analyzed} of ${urls.length} videos`)
        sessionStorage.setItem('bulkResults', JSON.stringify(data))
        queryClient.invalidateQueries({ queryKey: ['bulk-results'] })
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const scripts: any[] = data?.scripts || []
  const bulkResults: any[] = bulkData?.results || []

  async function adaptScript(id: string) {
    try {
      const res = await fetch(`/api/analyze/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adapt' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Script adapted for your niche!')
      queryClient.invalidateQueries({ queryKey: ['analyzed-scripts'] })
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function saveAsFramework(id: string) {
    try {
      const res = await fetch(`/api/analyze/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-framework' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Saved to Framework Library!')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function deleteAnalysis(id: string) {
    await fetch(`/api/analyze/${id}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['analyzed-scripts'] })
  }

  const triggerColors: Record<string, string> = {
    urgency: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    scarcity: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    social_proof: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    curiosity: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    fomo: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    authority: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    reciprocity: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    loss_aversion: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Script Analyzer</h2>
        <p className="text-sm text-neutral-500 mt-1">Paste any viral video URL and AI reverse-engineers the script, psychology triggers, and reusable framework. Adapt it for your niche in one click.</p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('single')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'single' ? 'bg-purple-500 text-white' : 'border border-neutral-200 dark:border-neutral-800'}`}
        >
          Single Video
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'bulk' ? 'bg-purple-500 text-white' : 'border border-neutral-200 dark:border-neutral-800'}`}
        >
          Bulk Analysis (up to 20)
        </button>
      </div>

      {/* Input form */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        {mode === 'single' ? (
          <div>
            <label className="text-sm font-medium">Video URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm"
              onKeyDown={e => e.key === 'Enter' && analyze()}
            />
            <p className="text-xs text-neutral-500 mt-1">YouTube works best (most reliable transcripts). TikTok and Instagram also supported.</p>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium">Video URLs (one per line, max 20)</label>
            <textarea
              value={bulkUrls}
              onChange={e => setBulkUrls(e.target.value)}
              rows={6}
              placeholder={'https://www.youtube.com/watch?v=video1\nhttps://www.youtube.com/watch?v=video2\nhttps://www.tiktok.com/@user/video/123'}
              className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm font-mono"
            />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={adaptForNiche}
            onChange={e => setAdaptForNiche(e.target.checked)}
            className="size-4 rounded"
          />
          <span className="text-sm">Auto-adapt script for my niche</span>
        </label>

        <button
          onClick={analyze}
          disabled={analyzing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {analyzing ? 'Analyzing…' : mode === 'single' ? 'Analyze Video' : `Analyze ${bulkUrls.split('\n').filter(u => u.trim()).length} Videos`}
        </button>
        <p className="text-xs text-neutral-500">Single analysis takes ~30-60 seconds. Bulk takes ~2-5 minutes.</p>
      </div>

      {/* Bulk results */}
      {mode === 'bulk' && bulkResults.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3">Bulk Results ({bulkResults.length})</h3>
          <div className="space-y-2">
            {bulkResults.map((r, i) => (
              <div key={i} className={`bg-white dark:bg-neutral-900 rounded-lg border p-3 ${r.success ? 'border-neutral-200 dark:border-neutral-800' : 'border-red-200 dark:border-red-800'}`}>
                {r.success ? (
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title || r.url}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Score: <strong className={r.viralScore >= 80 ? 'text-emerald-600' : r.viralScore >= 60 ? 'text-amber-600' : 'text-neutral-500'}>{r.viralScore}</strong>
                        {' · '}{r.framework}
                        {' · '}{r.psychologyTriggers?.join(', ')}
                      </p>
                    </div>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline ml-2">View</a>
                  </div>
                ) : (
                  <p className="text-sm text-red-600">Failed: {r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyzed scripts */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Analyzed Scripts ({scripts.length})</h3>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
        ) : scripts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <Search className="size-12 mx-auto text-neutral-300 mb-3" />
            <h3 className="font-semibold">No analyses yet</h3>
            <p className="text-sm text-neutral-500 mt-1">Paste a viral video URL above to reverse-engineer its script.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {scripts.map(s => (
              <div key={s.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-neutral-100 dark:border-neutral-800">
                  {s.thumbnailUrl && <img src={s.thumbnailUrl} alt="" className="size-16 rounded object-cover" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 capitalize">{s.platform}</span>
                      {s.viralScore != null && (
                        <span className={`text-xs font-bold ${s.viralScore >= 80 ? 'text-emerald-600' : s.viralScore >= 60 ? 'text-amber-600' : 'text-neutral-500'}`}>
                          Score: {s.viralScore}/100
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">{s.title || s.url}</p>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View original →</a>
                  </div>
                  <button onClick={() => deleteAnalysis(s.id)} className="text-red-500 text-xs hover:underline">Delete</button>
                </div>

                {/* Script breakdown */}
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                      <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase mb-1">Hook (0-3s)</p>
                      <p className="text-sm">{s.hookText || '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
                      <p className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase mb-1">Pattern Interrupt</p>
                      <p className="text-sm">{s.patternInterrupt || '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                      <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase mb-1">Body</p>
                      <p className="text-sm">{s.bodyText || '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                      <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase mb-1">CTA</p>
                      <p className="text-sm">{s.ctaText || '—'}</p>
                    </div>
                  </div>

                  {/* Psychology triggers */}
                  {s.psychologyTriggers?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Psychology Triggers</p>
                      <div className="flex flex-wrap gap-1.5">
                        {s.psychologyTriggers.map((t: string) => (
                          <span key={t} className={`text-xs px-2 py-0.5 rounded-full ${triggerColors[t] || 'bg-neutral-100 text-neutral-700'}`}>
                            {t.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Framework */}
                  {s.framework && (
                    <div>
                      <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Framework: {s.framework.name}</p>
                      <div className="flex flex-wrap items-center gap-1">
                        {s.framework.steps?.map((step: string, i: number) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800">
                            {i + 1}. {step}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Analysis notes */}
                  {s.analysisNotes && (
                    <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-950">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Why It Works</p>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300">{s.analysisNotes}</p>
                    </div>
                  )}

                  {/* Adapted script */}
                  {s.adaptedScript && (
                    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900">
                      <p className="text-[10px] font-bold text-orange-700 dark:text-orange-300 uppercase mb-1">Adapted for Your Niche</p>
                      <pre className="text-sm whitespace-pre-wrap font-sans">{s.adaptedScript}</pre>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {!s.adaptedScript && (
                      <button
                        onClick={() => adaptScript(s.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-orange-500 text-white"
                      >
                        <Wand2 className="size-3" /> Adapt for My Niche
                      </button>
                    )}
                    <button
                      onClick={() => saveAsFramework(s.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-800"
                    >
                      <Save className="size-3" /> Save as Framework
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function FrameworkLibrary() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['frameworks'],
    queryFn: async () => (await fetch('/api/frameworks')).json(),
  })

  async function deleteFramework(id: string) {
    await fetch('/api/frameworks', { method: 'DELETE', body: JSON.stringify({ id }), headers: { 'Content-Type': 'application/json' } })
    queryClient.invalidateQueries({ queryKey: ['frameworks'] })
  }

  const frameworks: any[] = data?.frameworks || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Framework Library</h2>
        <p className="text-sm text-neutral-500 mt-1">Reusable script templates extracted from viral videos. Use these as starting points for your content.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
      ) : frameworks.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <Layers className="size-12 mx-auto text-neutral-300 mb-3" />
          <h3 className="font-semibold">No frameworks saved yet</h3>
          <p className="text-sm text-neutral-500 mt-1">Analyze viral videos in the Script Analyzer tab, then click "Save as Framework" to add them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {frameworks.map(f => (
            <div key={f.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-sm">{f.name}</h3>
                  {f.niche && <p className="text-[10px] text-neutral-500 mt-0.5">Niche: {f.niche}</p>}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                  Used {f.useCount}x
                </span>
              </div>

              <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">{f.description}</p>

              {/* Steps */}
              <div className="mb-3">
                <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Steps</p>
                <div className="flex flex-wrap items-center gap-1">
                  {f.steps?.map((step: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800">
                      {i + 1}. {step}
                    </span>
                  ))}
                </div>
              </div>

              {/* Psychology triggers */}
              {f.psychologyTriggers?.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Psychology</p>
                  <div className="flex flex-wrap gap-1">
                    {f.psychologyTriggers.map((t: string) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                        {t.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Example script */}
              {f.exampleScript && (
                <details className="mb-2">
                  <summary className="text-xs text-blue-600 cursor-pointer hover:underline">View example script</summary>
                  <pre className="text-xs mt-1 p-2 bg-neutral-50 dark:bg-neutral-950 rounded whitespace-pre-wrap font-sans">{f.exampleScript}</pre>
                </details>
              )}

              {f.sourceUrl && (
                <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                  View source video →
                </a>
              )}

              <button
                onClick={() => deleteFramework(f.id)}
                className="block mt-2 text-xs text-red-500 hover:underline"
              >
                Delete framework
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
