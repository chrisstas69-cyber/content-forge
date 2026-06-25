'use client'

import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UploadCloud, Loader2 } from 'lucide-react'

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
  })
  const fileInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Get assets so user can pick watermark/intro/outro/music
  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await fetch('/api/assets')).json(),
  })
  const assets: any[] = assetsData?.assets || []

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'))
    setFiles(prev => [...prev, ...dropped])
  }, [])

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arr = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/'))
    setFiles(prev => [...prev, ...arr])
  }

  const startUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('video', file)
        fd.append('settings', JSON.stringify(settings))
        const res = await fetch('/api/videos', { method: 'POST', body: fd })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Upload failed for ${file.name}`)
        }
      }
      toast.success(`${files.length} video(s) queued for processing`)
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
      <h2 className="text-xl font-bold mb-1">Upload Videos</h2>
      <p className="text-sm text-neutral-500 mb-4">Drag-and-drop your raw videos. The system auto-transcribes, edits, scores, and prepares them for publishing.</p>

      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => fileInput.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
        }`}
      >
        <input ref={fileInput} type="file" accept="video/*" multiple className="hidden" onChange={handleSelect} />
        <UploadCloud className="size-10 mx-auto text-neutral-400 mb-2" />
        <p className="text-sm font-medium">{dragging ? 'Drop videos here' : 'Click or drag videos here'}</p>
        <p className="text-xs text-neutral-500 mt-1">MP4, MOV, WebM — multiple files allowed</p>
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
              <div className="flex items-center gap-2 min-w-0">
                <video src={URL.createObjectURL(f)} className="size-10 rounded bg-neutral-200 object-cover" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-neutral-500">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              </div>
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Settings */}
      <div className="mt-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h3 className="font-semibold text-sm mb-4">Auto-Editing Options</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Toggle label="Burn AI captions" desc="Transcribes audio and burns subtitles onto the video" checked={settings.burnCaptions} onChange={v => setSettings(s => ({ ...s, burnCaptions: v }))} />
          <Toggle label="Auto-trim silence" desc="Removes silent segments from the video" checked={settings.autoTrimSilence} onChange={v => setSettings(s => ({ ...s, autoTrimSilence: v }))} />

          <div>
            <label className="text-sm font-medium">Watermark</label>
            <select
              className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm"
              onChange={e => setSettings(s => ({ ...s, watermarkAssetId: e.target.value || undefined }))}
            >
              <option value="">None</option>
              {assets.filter(a => a.type === 'watermark').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Watermark Position</label>
            <select
              value={settings.watermarkPosition}
              onChange={e => setSettings(s => ({ ...s, watermarkPosition: e.target.value as any }))}
              className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm"
            >
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="center">Center</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Background Music</label>
            <select
              onChange={e => setSettings(s => ({ ...s, musicAssetId: e.target.value || undefined }))}
              className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm"
            >
              <option value="">None</option>
              {assets.filter(a => a.type === 'music').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Intro Clip</label>
            <select
              onChange={e => setSettings(s => ({ ...s, introAssetId: e.target.value || undefined }))}
              className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm"
            >
              <option value="">None</option>
              {assets.filter(a => a.type === 'intro').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Outro Clip</label>
            <select
              onChange={e => setSettings(s => ({ ...s, outroAssetId: e.target.value || undefined }))}
              className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm"
            >
              <option value="">None</option>
              {assets.filter(a => a.type === 'outro').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={startUpload}
          disabled={files.length === 0 || uploading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          {uploading ? 'Uploading…' : `Upload ${files.length} video(s)`}
        </button>
      </div>
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
