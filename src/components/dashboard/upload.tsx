'use client'

import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UploadCloud, Loader2, Film, Image as ImageIcon, X } from 'lucide-react'

export function Upload() {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [settings, setSettings] = useState({
    burnCaptions: true,
    watermarkPosition: 'bottom-right' as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center',
    watermarkOpacity: 0.7,
    watermarkScale: 0.15,
    musicVolume: 0.2,
    originalVolume: 1.0,
    autoTrimSilence: false,
    // Voiceover
    voiceoverEnabled: false,
    voiceoverVoice: 'tongtong',
    voiceoverTone: 'funny, energetic, engaging',
    voiceoverVolume: 1.0,
    voiceoverReplaceOriginal: false,
    // Image-specific settings (used when uploading photos)
    perImageSec: 5,
    transitionSec: 0.7,
    voiceoverScript: '',  // optional custom script for image uploads
  })
  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await fetch('/api/assets')).json(),
  })
  const assets: any[] = assetsData?.assets || []

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('video/') || f.type.startsWith('image/')
    )
    setFiles(prev => [...prev, ...dropped])
  }, [])

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arr = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/'))
    setFiles(prev => [...prev, ...arr])
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arr = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...arr])
  }

  // Separate files by type
  const videoFiles = files.filter(f => f.type.startsWith('video/'))
  const imageFiles = files.filter(f => f.type.startsWith('image/'))

  const startUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    try {
      // Upload videos one by one (existing behavior)
      for (const file of videoFiles) {
        const fd = new FormData()
        fd.append('video', file)
        fd.append('settings', JSON.stringify(settings))
        const res = await fetch('/api/videos', { method: 'POST', body: fd })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Upload failed for ${file.name}`)
        }
      }

      // Upload all images together as a single slideshow (new behavior)
      if (imageFiles.length > 0) {
        const fd = new FormData()
        for (const img of imageFiles) {
          fd.append('images', img)
        }
        fd.append('settings', JSON.stringify({
          perImageSec: settings.perImageSec,
          transitionSec: settings.transitionSec,
          burnCaptions: settings.burnCaptions,
          voiceoverEnabled: settings.voiceoverEnabled || true,  // default ON for images
          voiceoverVoice: settings.voiceoverVoice,
          voiceoverTone: settings.voiceoverTone,
          voiceoverReplaceOriginal: true,
          voiceoverScript: settings.voiceoverScript || undefined,
          musicVolume: settings.musicVolume,
          watermarkPosition: settings.watermarkPosition,
          watermarkOpacity: settings.watermarkOpacity,
          watermarkScale: settings.watermarkScale,
        }))
        const res = await fetch('/api/videos', { method: 'POST', body: fd })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Image upload failed`)
        }
        toast.success(`${imageFiles.length} image(s) → slideshow queued!`)
      }

      if (videoFiles.length > 0) {
        toast.success(`${videoFiles.length} video(s) queued for processing`)
      }

      setFiles([])
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Upload Content</h2>
      <p className="text-sm text-neutral-500 mb-4">Upload videos OR photos. Photos are auto-converted to a video with Ken Burns effect, voiceover, captions, and music.</p>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => fileInput.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
        }`}
      >
        <input ref={fileInput} type="file" accept="video/*" multiple className="hidden" onChange={handleVideoSelect} />
        <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
        <UploadCloud className="size-10 mx-auto text-neutral-400 mb-2" />
        <p className="text-sm font-medium">{dragging ? 'Drop files here' : 'Click or drag videos here'}</p>
        <p className="text-xs text-neutral-500 mt-1">MP4, MOV, WebM — multiple files allowed</p>
      </div>

      {/* Image upload button (separate) */}
      <div className="mt-3 flex justify-center">
        <button
          onClick={() => imageInput.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-300 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-50 dark:hover:bg-purple-900/20"
        >
          <ImageIcon className="size-4" />
          Upload Photos Instead
        </button>
        <span className="text-xs text-neutral-500 self-center ml-3">→ becomes a video with voiceover + music + captions</span>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {videoFiles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase mb-1">Videos ({videoFiles.length})</p>
              {videoFiles.map((f, i) => (
                <FileRow key={`v-${i}`} file={f} icon={Film} onRemove={() => setFiles(prev => prev.filter(x => x !== f))} />
              ))}
            </div>
          )}
          {imageFiles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-600 uppercase mb-1">Photos → Slideshow ({imageFiles.length})</p>
              {imageFiles.map((f, i) => (
                <FileRow key={`i-${i}`} file={f} icon={ImageIcon} preview onRemove={() => setFiles(prev => prev.filter(x => x !== f))} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image-specific settings (only shown when images are uploaded) */}
      {imageFiles.length > 0 && (
        <div className="mt-4 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800 p-5">
          <h3 className="font-semibold text-sm mb-3 text-purple-800 dark:text-purple-200">Photo Slideshow Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Seconds per photo ({settings.perImageSec}s)</label>
              <input type="range" min={2} max={10} step={1} value={settings.perImageSec} onChange={e => setSettings(s => ({ ...s, perImageSec: parseInt(e.target.value) }))} className="w-full mt-2" />
            </div>
            <div>
              <label className="text-sm font-medium">Transition ({settings.transitionSec}s)</label>
              <input type="range" min={0.3} max={2} step={0.1} value={settings.transitionSec} onChange={e => setSettings(s => ({ ...s, transitionSec: parseFloat(e.target.value) }))} className="w-full mt-2" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Custom voiceover script (optional — leave blank for AI to generate)</label>
              <textarea
                value={settings.voiceoverScript}
                onChange={e => setSettings(s => ({ ...s, voiceoverScript: e.target.value }))}
                rows={3}
                placeholder="e.g. Meet Max, the goodest boy! Every morning he wakes me up at 6am for breakfast..."
                className="w-full mt-1 px-3 py-2 rounded-md border border-purple-200 dark:border-purple-800 bg-white dark:bg-neutral-900 text-sm"
              />
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">If provided, this exact script will be used for the voiceover + captions. If blank, AI generates one based on your niche.</p>
            </div>
          </div>
        </div>
      )}

      {/* Standard edit settings */}
      <div className="mt-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h3 className="font-semibold text-sm mb-4">Auto-Editing Options (applies to all uploads)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Toggle label="Burn AI captions" desc="Burns subtitles onto the video" checked={settings.burnCaptions} onChange={v => setSettings(s => ({ ...s, burnCaptions: v }))} />
          <Toggle label="Auto-trim silence" desc="Removes silent segments (videos only)" checked={settings.autoTrimSilence} onChange={v => setSettings(s => ({ ...s, autoTrimSilence: v }))} />

          <div>
            <label className="text-sm font-medium">Watermark</label>
            <select onChange={e => setSettings(s => ({ ...s, watermarkAssetId: e.target.value || undefined }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
              <option value="">None</option>
              {assets.filter(a => a.type === 'watermark').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Watermark Position</label>
            <select value={settings.watermarkPosition} onChange={e => setSettings(s => ({ ...s, watermarkPosition: e.target.value as any }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="center">Center</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Background Music</label>
            <select onChange={e => setSettings(s => ({ ...s, musicAssetId: e.target.value || undefined }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
              <option value="">None</option>
              {assets.filter(a => a.type === 'music').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Intro Clip</label>
            <select onChange={e => setSettings(s => ({ ...s, introAssetId: e.target.value || undefined }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
              <option value="">None</option>
              {assets.filter(a => a.type === 'intro').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Voiceover settings */}
      <div className="mt-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h3 className="font-semibold text-sm mb-4">AI Voiceover</h3>
        <div className="space-y-4">
          <Toggle
            label="Enable AI voiceover"
            desc={imageFiles.length > 0 ? "Auto-enabled for photo uploads — generates a script and speaks it" : "Generate a script and mix it over the video"}
            checked={imageFiles.length > 0 ? true : settings.voiceoverEnabled}
            onChange={v => setSettings(s => ({ ...s, voiceoverEnabled: v }))}
          />
          {(settings.voiceoverEnabled || imageFiles.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Voice</label>
                <select value={settings.voiceoverVoice} onChange={e => setSettings(s => ({ ...s, voiceoverVoice: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
                  <option value="tongtong">Tongtong (Warm, friendly)</option>
                  <option value="female-tianmei">Tianmei (Female, cheerful)</option>
                  <option value="male-yunlong">Yunlong (Male, deep)</option>
                  <option value="female-shaonv">Shaonv (Female, young)</option>
                  <option value="male-yunhao">Yunhao (Male, energetic)</option>
                  <option value="female-yujia">Yujia (Female, calm)</option>
                  <option value="male-siling">Siling (Male, authoritative)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Tone</label>
                <input value={settings.voiceoverTone} onChange={e => setSettings(s => ({ ...s, voiceoverTone: e.target.value }))} placeholder="e.g. funny, energetic, engaging" className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={startUpload}
          disabled={files.length === 0 || uploading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          {uploading ? 'Uploading…' : `Upload ${files.length} file(s)`}
        </button>
      </div>
    </div>
  )
}

function FileRow({ file, icon: Icon, onRemove, preview }: { file: File; icon: any; onRemove: () => void; preview?: boolean }) {
  const [previewUrl, setPreviewUrl] = useState<string>('')
  if (preview && !previewUrl) {
    const reader = new FileReader()
    reader.onload = e => setPreviewUrl(e.target?.result as string)
    reader.readAsDataURL(file)
  }
  return (
    <div className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
      <div className="flex items-center gap-2 min-w-0">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-10 rounded object-cover" />
        ) : (
          <Icon className="size-5 text-neutral-400 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-neutral-500">{(file.size / 1024 / 1024).toFixed(1)} MB · {file.type.startsWith('video/') ? 'Video' : 'Photo'}</p>
        </div>
      </div>
      <button onClick={onRemove} className="text-neutral-400 hover:text-red-600">
        <X className="size-4" />
      </button>
    </div>
  )
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left">
      <span className={`mt-0.5 size-5 rounded-md flex items-center justify-center border ${checked ? 'bg-orange-500 border-orange-500 text-white' : 'border-neutral-300 dark:border-neutral-700'}`}>
        {checked && <svg className="size-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-neutral-500 mt-0.5">{desc}</p>}
      </div>
    </button>
  )
}
