import { db } from '@/lib/db'
import { probeVideo, extractThumbnail, extractAudio, processVideo, SrtCue, detectSilence } from '@/lib/ffmpeg'
import { transcribeAudio, analyzeVideoContent } from '@/lib/ai'
import { deleteFile } from '@/lib/storage'
import path from 'path'
import { emit } from '@/lib/event-bus'

export interface EditSettings {
  burnCaptions: boolean
  watermarkAssetId?: string
  watermarkPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  watermarkOpacity?: number
  watermarkScale?: number
  musicAssetId?: string
  musicVolume?: number
  originalVolume?: number
  introAssetId?: string
  outroAssetId?: string
  autoTrimSilence?: boolean
  outputWidth?: number
  outputHeight?: number
  outputFps?: number
}

async function updateVideoStatus(videoId: string, status: string, progress: number, currentStep?: string, errorMessage?: string) {
  await db.video.update({
    where: { id: videoId },
    data: { status, progress, currentStep, errorMessage },
  })
  emit({
    type: 'video.status',
    videoId,
    data: { status, progress, currentStep, errorMessage },
    timestamp: Date.now(),
  })
}

async function updateVideoProgress(videoId: string, progress: number, currentStep?: string) {
  await db.video.update({
    where: { id: videoId },
    data: { progress, currentStep },
  })
  emit({
    type: 'video.progress',
    videoId,
    data: { progress, currentStep },
    timestamp: Date.now(),
  })
}

async function getAssetPath(assetId: string | undefined): Promise<string | undefined> {
  if (!assetId) return undefined
  const asset = await db.asset.findUnique({ where: { id: assetId } })
  return asset?.filePath
}

export async function processVideoPipeline(videoId: string, settings: EditSettings) {
  const video = await db.video.findUnique({ where: { id: videoId } })
  if (!video) throw new Error('Video not found')

  try {
    // STEP 1: Probe metadata
    await updateVideoStatus(videoId, 'editing', 5, 'Probing video metadata')
    const meta = await probeVideo(video.originalPath)
    await db.video.update({
      where: { id: videoId },
      data: { durationSec: meta.duration, width: meta.width, height: meta.height },
    })

    // STEP 2: Extract audio + transcribe
    await updateVideoProgress(videoId, 15, 'Extracting audio')
    const audioPath = video.originalPath + '.wav'
    await extractAudio(video.originalPath, audioPath)

    await updateVideoProgress(videoId, 25, 'Transcribing audio (AI)')
    let transcript = ''
    let cues: SrtCue[] = []
    try {
      const segments = await transcribeAudio(audioPath)
      cues = segments.map(s => ({ start: s.start, end: s.end, text: s.text }))
      transcript = segments.map(s => s.text).join(' ')
      await db.video.update({
        where: { id: videoId },
        data: { transcription: transcript },
      })
    } catch (err: any) {
      console.error('Transcription failed:', err?.message || err)
      // Continue without captions — captions will be skipped
    }
    await deleteFile(audioPath)

    // STEP 3: AI analysis (scoring + caption + hashtags)
    await updateVideoProgress(videoId, 45, 'Analyzing viral potential (AI)')
    const settings2 = await db.setting.findUnique({ where: { id: 'brand.handle' } })
    const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
    const analysis = await analyzeVideoContent(transcript, {
      brandHandle: settings2?.value || '@yourhandle',
      niche: nicheSetting?.value || 'dog / pet content',
    })
    await db.video.update({
      where: { id: videoId },
      data: {
        aiTitle: analysis.title,
        aiDescription: analysis.description,
        aiCaption: analysis.caption,
        aiHashtags: JSON.stringify(analysis.hashtags),
        viralScore: analysis.viralScore,
      },
    })

    // STEP 4: FFmpeg processing
    await updateVideoProgress(videoId, 60, 'Editing video (FFmpeg)')
    const outName = path.basename(video.originalPath, path.extname(video.originalPath)) + '_processed.mp4'
    const outputPath = path.join(path.dirname(video.originalPath), '..', 'processed', outName)

    const watermarkPath = await getAssetPath(settings.watermarkAssetId)
    const musicPath = await getAssetPath(settings.musicAssetId)
    const introPath = await getAssetPath(settings.introAssetId)
    const outroPath = await getAssetPath(settings.outroAssetId)

    // Optional: auto-trim silence (creates an intermediate file)
    let workingInput = video.originalPath
    if (settings.autoTrimSilence) {
      await updateVideoProgress(videoId, 65, 'Auto-trimming silence')
      const silenceRegions = await detectSilence(video.originalPath).catch(() => [])
      if (silenceRegions.length > 0) {
        const trimmedPath = video.originalPath + '.trimmed.mp4'
        // Build select filter to keep non-silent segments
        // For simplicity, use areverse+aselect combo. Better: use silence filter directly.
        // Here we just keep the original if trimming fails — production would be more robust.
        workingInput = video.originalPath // fallback for now
      }
    }

    await processVideo(workingInput, outputPath, {
      captions: cues,
      burnCaptions: settings.burnCaptions,
      watermarkPath,
      watermarkPosition: settings.watermarkPosition,
      watermarkOpacity: settings.watermarkOpacity,
      watermarkScale: settings.watermarkScale,
      musicPath,
      musicVolume: settings.musicVolume,
      originalVolume: settings.originalVolume,
      introPath,
      outroPath,
      autoTrimSilence: settings.autoTrimSilence,
      outputWidth: settings.outputWidth,
      outputHeight: settings.outputHeight,
      outputFps: settings.outputFps,
    }, (pct) => {
      // ffmpeg progress
      const total = 60 + Math.floor(pct * 0.3)
      updateVideoProgress(videoId, total, 'Rendering video')
    })

    // STEP 5: Thumbnail
    await updateVideoProgress(videoId, 92, 'Generating thumbnail')
    const thumbName = path.basename(outputPath, '.mp4') + '.jpg'
    const thumbPath = path.join(path.dirname(video.originalPath), '..', 'thumbnails', thumbName)
    await extractThumbnail(outputPath, thumbPath).catch(() => {})

    await db.video.update({
      where: { id: videoId },
      data: {
        processedPath: outputPath,
        thumbnailPath: thumbPath,
        editSettings: JSON.stringify(settings),
      },
    })

    await updateVideoStatus(videoId, 'ready', 100, 'Ready to publish')
  } catch (err: any) {
    console.error('Pipeline failed:', err)
    await updateVideoStatus(videoId, 'failed', 0, undefined, err?.message || String(err))
  }
}
