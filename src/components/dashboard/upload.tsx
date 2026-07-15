'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UploadCloud, Loader2, Film, Image as ImageIcon, X } from 'lucide-react'
import { Upload as TusUpload } from 'tus-js-client'
import { createClient } from '@/lib/supabase/browser'
import { getSupabaseEnv } from '@/lib/supabase/env'

const TUS_CHUNK_SIZE = 6 * 1024 * 1024
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])

function fileExtension(file: Pick<File, 'name'>) {
  return file.name.toLowerCase().split('.').pop() || ''
}

function isVideoFile(file: File) {
  return file.type.startsWith('video/') || VIDEO_EXTENSIONS.has(fileExtension(file))
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(fileExtension(file))
}

function uploadContentType(file: File) {
  const extension = fileExtension(file)
  if (extension === 'mov') return 'video/quicktime'
  if (extension === 'mp4' || extension === 'm4v') return 'video/mp4'
  if (extension === 'webm') return 'video/webm'
  return file.type
}

async function uploadResumable(
  supabase: ReturnType<typeof createClient>,
  file: File,
  objectPath: string,
  onProgress: (uploaded: number, total: number) => void,
) {
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) throw new Error('Your session expired. Sign in again, then retry the upload.')

  const { url, key } = getSupabaseEnv()
  await new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: `${url}/storage/v1/upload/resumable`,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      chunkSize: TUS_CHUNK_SIZE,
      uploadSize: file.size,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: key,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: 'content-media',
        objectName: objectPath,
        contentType: uploadContentType(file),
        cacheControl: '3600',
      },
      onError: reject,
      onProgress,
      onSuccess: () => resolve(),
    })
    upload.start()
  })
}

export function Upload() {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
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
  const queryClient = useQueryClient()

  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await fetch('/api/assets')).json(),
  })
  const assets: any[] = assetsData?.assets || []

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const selected = Array.from(e.dataTransfer.files)
    const dropped = selected.filter(f => isVideoFile(f) || isImageFile(f))
    if (selected.length > dropped.length) toast.error('Use MP4, MOV, M4V, WebM, JPG, PNG, WebP, HEIC, or HEIF files.')
    setFiles(prev => [...prev, ...dropped])
  }, [])

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    const arr = selected.filter(isVideoFile)
    if (selected.length > arr.length) toast.error('That video format is not supported. Use MP4, MOV, M4V, or WebM.')
    setFiles(prev => [...prev, ...arr])
    e.target.value = ''
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    const arr = selected.filter(isImageFile)
    if (selected.length > arr.length) toast.error('That photo format is not supported. Use JPG, PNG, WebP, HEIC, or HEIF.')
    setFiles(prev => [...prev, ...arr])
    e.target.value = ''
  }

  // Separate files by type
  const videoFiles = files.filter(isVideoFile)
  const imageFiles = files.filter(isImageFile)

  const startUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setUploadProgress(0)
    try {
      const batches: { files: File[]; settings: Record<string, unknown> }[] = videoFiles.map(file => ({ files: [file], settings }))
      if (imageFiles.length) batches.push({
        files: imageFiles,
        settings: {
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
        },
      })

      const supabase = createClient()
      let uploadedFiles = 0
      const totalFiles = files.length
      for (const batch of batches) {
        const start = await fetch('/api/uploads/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: batch.files.map(file => ({ name: file.name, type: uploadContentType(file), size: file.size })), settings: batch.settings }),
        })
        const prepared = await start.json()
        if (!start.ok) throw new Error(prepared.error || 'Could not start the upload')

        for (let index = 0; index < batch.files.length; index += 1) {
          const target = prepared.uploads[index]
          try {
            await uploadResumable(supabase, batch.files[index], target.path, (bytesUploaded, bytesTotal) => {
              const completed = uploadedFiles + (bytesTotal > 0 ? bytesUploaded / bytesTotal : 0)
              setUploadProgress(Math.round((completed / totalFiles) * 100))
            })
          } catch (resumableError) {
            console.warn('Resumable upload failed; trying signed upload.', resumableError)
            const { error: signedError } = await supabase.storage.from('content-media').uploadToSignedUrl(
              target.path,
              target.token,
              batch.files[index],
              { contentType: uploadContentType(batch.files[index]) },
            )
            if (signedError) throw new Error(`Upload failed for ${batch.files[index].name}: ${signedError.message}`)
          }
          uploadedFiles += 1
          setUploadProgress(Math.round((uploadedFiles / totalFiles) * 100))
        }

        const complete = await fetch('/api/uploads/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: prepared.itemId }),
        })
        const completed = await complete.json()
        if (!complete.ok) throw new Error(completed.error || 'The upload finished but could not be queued')
      }

      toast.success(`${files.length} file(s) uploaded safely and queued`)

      setFiles([])
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Upload Content</h2>
      <p className="text-sm text-neutral-500 mb-4">Upload videos OR photos. Photos are auto-converted to a video with Ken Burns effect, voiceover, captions, and music.</p>

      {/* Drop zone */}
      <label
        htmlFor="content-video-upload"
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
        }`}
      >
        <input id="content-video-upload" type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple className="sr-only" onChange={handleVideoSelect} />
        <UploadCloud className="size-10 mx-auto text-neutral-400 mb-2" />
        <p className="text-sm font-medium">{dragging ? 'Drop files here' : 'Choose a video from this device'}</p>
        <p className="text-xs text-neutral-500 mt-1">MP4, MOV, WebM — multiple files allowed</p>
      </label>

      {/* Image upload button (separate) */}
      <div className="mt-3 flex justify-center">
        <input id="content-image-upload" type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple className="sr-only" onChange={handleImageSelect} />
        <label
          htmlFor="content-image-upload"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-300 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-50 dark:hover:bg-purple-900/20"
        >
          <ImageIcon className="size-4" />
          Upload Photos Instead
        </label>
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
          {uploading ? `Uploading… ${uploadProgress}%` : `Upload ${files.length} file(s)`}
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
          <p className="text-xs text-neutral-500">{(file.size / 1024 / 1024).toFixed(1)} MB · {isVideoFile(file) ? 'Video' : 'Photo'}</p>
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
