'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Image as ImageIcon, Film, Wand2, AlertCircle, Upload, X, Download, ExternalLink } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function Generate() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'image' | 'thumbnail' | 'broll'>('thumbnail')
  const [prompt, setPrompt] = useState('')
  const [title, setTitle] = useState('')
  const [videoId, setVideoId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [generationMessage, setGenerationMessage] = useState('')
  // NEW: image upload state for img2img thumbnails
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [uploadedPreview, setUploadedPreview] = useState<string>('')
  const [promptStrength, setPromptStrength] = useState(0.35)
  const fileInput = useRef<HTMLInputElement>(null)

  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['generated-assets', tab],
    queryFn: async () => {
      const response = await fetch(`/api/generate?type=${tab}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load generated assets')
      return data
    },
    refetchInterval: 10000,
  })

  const { data: videosData } = useQuery({
    queryKey: ['videos-for-gen'],
    queryFn: async () => (await fetch('/api/videos')).json(),
    enabled: tab === 'thumbnail',
  })

  async function optimizePhonePhoto(file: File): Promise<File> {
    // Vercel's request limit is lower than many untouched phone photos. Resize in
    // the browser so people can use normal camera pictures without editing them first.
    const maximumUploadBytes = 3.5 * 1024 * 1024
    if (file.size <= maximumUploadBytes) return file

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const element = new Image()
      element.onload = () => { URL.revokeObjectURL(url); resolve(element) }
      element.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')) }
      element.src = url
    })

    let scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      const quality = Math.max(0.68, 0.88 - attempt * 0.07)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= maximumUploadBytes) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified })
      }
      scale *= 0.75
    }
    throw new Error('That photo is unusually large. Please choose one under 25 MB.')
  }

  async function handleImageSelect(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG, PNG, or WebP photo')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('Photo is too large. Choose one smaller than 25 MB.')
      return
    }
    let uploadFile = file
    try {
      if (file.size > 3.5 * 1024 * 1024) {
        toast.info('Optimizing your phone photo for upload…')
        uploadFile = await optimizePhonePhoto(file)
      }
    } catch (error: any) {
      toast.error(error?.message || 'Could not prepare that photo')
      return
    }
    setUploadedImage(uploadFile)
    const reader = new FileReader()
    reader.onload = e => setUploadedPreview(e.target?.result as string)
    reader.readAsDataURL(uploadFile)
  }

  function clearImage() {
    setUploadedImage(null)
    setUploadedPreview('')
    if (fileInput.current) fileInput.current.value = ''
  }

  async function generate() {
    if (tab === 'thumbnail' && !title) return
    if (tab !== 'thumbnail' && !prompt) return
    setGenerationError('')
    setGenerationMessage('')
    setGenerating(true)
    try {
      // Use multipart/form-data if we have an uploaded image
      if (tab === 'thumbnail' && uploadedImage) {
        const fd = new FormData()
        fd.append('type', 'thumbnail')
        fd.append('title', title)
        fd.append('image', uploadedImage)
        fd.append('promptStrength', String(promptStrength))
        if (videoId) fd.append('videoId', videoId)
        const res = await fetch('/api/generate', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Generation failed')
        toast.success(data.message || 'Image-to-image generation started!')
        setGenerationMessage(data.message || 'Generation started. The result will appear below automatically.')
        queryClient.invalidateQueries({ queryKey: ['generated-assets', tab] })
        clearImage()
      } else {
        // Standard JSON request (text-only)
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
        setGenerationMessage(data.message || 'Your asset was generated successfully.')
        queryClient.invalidateQueries({ queryKey: ['generated-assets', tab] })
        setPrompt('')
      }
    } catch (err: any) {
      const message = err?.message || 'Generation failed. Check your configuration and try again.'
      setGenerationError(message)
      toast.error(message, { duration: 8000 })
    } finally {
      setGenerating(false)
    }
  }

  const assets: any[] = assetsData?.assets || []
  const videos: any[] = videosData?.videos || []

  const tabs = [
    { id: 'thumbnail' as const, label: 'AI Thumbnail', icon: ImageIcon, desc: 'Create an eye-catching video thumbnail' },
    { id: 'image' as const, label: 'AI Image', icon: ImageIcon, desc: 'Create a standalone image from a description' },
    { id: 'broll' as const, label: 'AI B-roll Video', icon: Film, desc: 'Generate video clips from text (requires Replicate API token)' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">AI Generation</h2>
        <p className="text-sm text-neutral-500 mt-1">Generate thumbnails, images, and B-roll video with AI. Upload your own photo to use as a base for thumbnails.</p>
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

            {/* NEW: Image upload for img2img */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <label className="text-sm font-medium flex items-center gap-2">
                <Upload className="size-4" />
                Upload your own image (optional)
              </label>
              <p className="text-xs text-neutral-500 mt-0.5 mb-2">
                Upload a photo (e.g. your dog) and AI will transform it into a stylized thumbnail. Without an upload, AI generates from scratch.
              </p>
              <input
                ref={fileInput}
                id="thumbnail-photo-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={e => e.target.files?.[0] && handleImageSelect(e.target.files[0])}
              />
              {uploadedPreview ? (
                <div className="relative inline-block">
                  <img src={uploadedPreview} alt="Uploaded" className="max-h-40 rounded-lg border border-neutral-200 dark:border-neutral-800" />
                  <button
                    onClick={clearImage}
                    className="absolute -top-2 -right-2 size-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="thumbnail-photo-upload"
                  className="w-full p-6 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-orange-400 dark:hover:border-orange-500 text-center cursor-pointer"
                >
                  <Upload className="size-6 mx-auto text-neutral-400 mb-1" />
                  <p className="text-xs text-neutral-500">Click to upload your photo</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">JPG, PNG, or WebP · phone photos are optimized automatically</p>
                </label>
              )}

              {/* Prompt strength slider — only shown when image is uploaded */}
              {uploadedImage && (
                <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                  <label className="text-xs font-medium text-blue-800 dark:text-blue-200">
                    Style strength: {Math.round(promptStrength * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={0.8}
                    step={0.05}
                    value={promptStrength}
                    onChange={e => setPromptStrength(parseFloat(e.target.value))}
                    className="w-full mt-2"
                  />
                  <p className="text-[10px] text-blue-700 dark:text-blue-300 mt-1">
                    {promptStrength < 0.3 ? 'Low — your photo stays very recognizable, minimal AI styling' :
                     promptStrength < 0.5 ? 'Medium — balanced: your photo + thumbnail styling' :
                     'High — more AI transformation, less like the original'}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Uses your configured AI image provider. Replicate is only needed as a fallback.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            <label className="text-sm font-medium">{tab === 'broll' ? 'Describe the scene' : 'Describe the image'}</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder={tab === 'broll' ? 'Cinematic shot of a golden retriever running on a beach at sunset, slow motion' : 'A cozy living room with a sleeping cat, warm lighting, watercolor style'} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
          </div>
        )}
        <button
          onClick={generate}
          disabled={generating || (tab === 'thumbnail' ? !title : !prompt)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          {generating ? 'Generating…' : uploadedImage ? 'Generate from your photo' : `Generate ${tab === 'broll' ? 'video' : 'image'}`}
        </button>
        {generating && (
          <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            Generating your {tab === 'broll' ? 'video' : 'image'}… Keep this page open. Images may take up to a minute; videos may take several minutes.
          </div>
        )}
        {generationMessage && !generating && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            {generationMessage}
          </div>
        )}
        {generationError && !generating && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <p className="font-medium">Generation failed</p>
            <p className="mt-1">{generationError}</p>
            <button onClick={generate} className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950">Try again</button>
          </div>
        )}
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
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center dark:border-neutral-700">
            <ImageIcon className="mx-auto size-8 text-neutral-300 dark:text-neutral-600" />
            <p className="mt-3 text-sm font-medium">No {tab} generations yet</p>
            <p className="mt-1 text-xs text-neutral-500">Enter a description above to create your first result.</p>
          </div>
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
                    <div className="flex flex-col items-center gap-1">
                      <Loader2 className="size-6 animate-spin text-neutral-400" />
                      <span className="text-[10px] text-neutral-500">Generating…</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <AlertCircle className="size-6 text-red-400" />
                      <span className="text-[10px] text-red-500">Failed</span>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[10px] text-neutral-500 truncate">{a.prompt}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[9px] text-neutral-400">{a.modelUsed}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${a.status === 'ready' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : a.status === 'generating' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>{a.status}</span>
                  </div>
                  {a.status === 'ready' && a.url && a.type !== 'broll' && (
                    <div className="flex gap-2 mt-2">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline">
                        <ExternalLink className="size-3" /> Open
                      </a>
                      <a href={a.url} download className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline">
                        <Download className="size-3" /> Save
                      </a>
                    </div>
                  )}
                  {a.status === 'ready' && a.type === 'thumbnail' && a.videoId && (
                    <p className="mt-2 text-[10px] text-emerald-600">Applied to your selected video</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
