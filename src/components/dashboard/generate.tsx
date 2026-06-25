'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Image as ImageIcon, Film, Wand2, Sparkles, AlertCircle } from 'lucide-react'
import { useState } from 'react'

export function Generate() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'image' | 'thumbnail' | 'broll'>('thumbnail')
  const [prompt, setPrompt] = useState('')
  const [title, setTitle] = useState('')
  const [videoId, setVideoId] = useState('')
  const [generating, setGenerating] = useState(false)

  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['generated-assets', tab],
    queryFn: async () => (await fetch(`/api/generate?type=${tab}`)).json(),
    refetchInterval: 10000, // refresh every 10s to catch completed generations
  })

  // Get videos for thumbnail target picker
  const { data: videosData } = useQuery({
    queryKey: ['videos-for-gen'],
    queryFn: async () => (await fetch('/api/videos')).json(),
    enabled: tab === 'thumbnail',
  })

  async function generate() {
    if (tab === 'thumbnail' && !title) return
    if (tab !== 'thumbnail' && !prompt) return
    setGenerating(true)
    try {
      const body: any = { type: tab }
      if (tab === 'thumbnail') {
        body.title = title
        if (videoId) body.videoId = videoId
      } else {
        body.prompt = prompt
      }
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      toast.success(data.message || 'Asset generated!')
      queryClient.invalidateQueries({ queryKey: ['generated-assets', tab] })
      setPrompt('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const assets: any[] = assetsData?.assets || []
  const videos: any[] = videosData?.videos || []

  const tabs = [
    { id: 'thumbnail' as const, label: 'AI Thumbnail', icon: ImageIcon, desc: 'Generate eye-catching thumbnails (no API key needed)' },
    { id: 'image' as const, label: 'AI Image', icon: ImageIcon, desc: 'Generate any image from text (no API key needed)' },
    { id: 'broll' as const, label: 'AI B-roll Video', icon: Film, desc: 'Generate video clips from text (requires Replicate API token)' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">AI Generation</h2>
        <p className="text-sm text-neutral-500 mt-1">Generate thumbnails, images, and B-roll video with AI.</p>
      </div>

      {/* Tab selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`p-3 rounded-lg border text-left ${tab === t.id ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'border-neutral-200 dark:border-neutral-800'}`}
            >
              <Icon className={`size-5 mb-1 ${tab === t.id ? 'text-orange-600' : 'text-neutral-500'}`} />
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">{t.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Input form */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        {tab === 'thumbnail' ? (
          <>
            <div>
              <label className="text-sm font-medium">Video title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Puppy's First Day at the Beach" className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Target video (optional)</label>
              <select value={videoId} onChange={e => setVideoId(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
                <option value="">None (standalone)</option>
                {videos.map(v => <option key={v.id} value={v.id}>{v.aiTitle || v.filename}</option>)}
              </select>
            </div>
          </>
        ) : (
          <div>
            <label className="text-sm font-medium">Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder={tab === 'broll' ? 'cinematic shot of a golden retriever running on a beach at sunset, slow motion' : 'a cozy living room with a sleeping cat, warm lighting, watercolor style'} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
          </div>
        )}
        <button
          onClick={generate}
          disabled={generating || (tab === 'thumbnail' ? !title : !prompt)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          {generating ? 'Generating…' : `Generate ${tab === 'broll' ? 'video' : 'image'}`}
        </button>
        {tab === 'broll' && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="size-3" /> Requires Replicate API token in Settings → API Keys. Generation takes 2-5 minutes.
          </p>
        )}
      </div>

      {/* Results */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Recent generations</h3>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
        ) : assets.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-8">No {tab} generations yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {assets.map(a => (
              <div key={a.id} className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="aspect-square bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                  {a.status === 'ready' && a.url ? (
                    a.type === 'broll' ? (
                      <video src={a.url} className="size-full object-cover" muted />
                    ) : (
                      <img src={a.url} alt={a.prompt} className="size-full object-cover" />
                    )
                  ) : a.status === 'generating' ? (
                    <Loader2 className="size-6 animate-spin text-neutral-400" />
                  ) : (
                    <AlertCircle className="size-6 text-red-400" />
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[10px] text-neutral-500 truncate">{a.prompt}</p>
                  <p className="text-[10px] mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded ${a.status === 'ready' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : a.status === 'generating' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>{a.status}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
