import { db } from '@/lib/db'
import { probeVideo, extractThumbnail, extractAudio, processVideo, SrtCue, detectSilence, convertToAspectRatio, generateFormatThumbnail, AspectRatio } from '@/lib/ffmpeg'
import { transcribeAudio, analyzeVideoContent, generateVoiceoverScript, generateTTS } from '@/lib/ai'
import { getTrendsContext } from '@/lib/trends'
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
  // Voiceover
  voiceoverEnabled?: boolean
  voiceoverVoice?: string
  voiceoverTone?: string
  voiceoverVolume?: number  // 0-1, how loud the voiceover should be in the mix
  voiceoverReplaceOriginal?: boolean // if true, replace original audio; otherwise mix
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

    // STEP 3: AI analysis (scoring + caption + hashtags) — uses trends if available
    await updateVideoProgress(videoId, 45, 'Analyzing viral potential (AI)')
    const settings2 = await db.setting.findUnique({ where: { id: 'brand.handle' } })
    const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
    const niche = nicheSetting?.value || 'pet content'
    // Fetch trends context for this niche
    let trendsContext = ''
    try {
      trendsContext = await getTrendsContext(niche)
    } catch (err) {
      console.error('Failed to fetch trends context:', err)
    }
    const analysis = await analyzeVideoContent(transcript, {
      brandHandle: settings2?.value || '@yourhandle',
      niche,
      trendsContext,
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

    // STEP 3.5: Voiceover generation (if enabled)
    let voiceoverPath: string | undefined
    if (settings.voiceoverEnabled) {
      await updateVideoProgress(videoId, 52, 'Generating AI voiceover script')
      try {
        const script = await generateVoiceoverScript(transcript, {
          niche,
          brandHandle: settings2?.value || '@yourhandle',
          videoDescription: analysis.description,
          tone: settings.voiceoverTone,
        })
        await db.video.update({
          where: { id: videoId },
          data: { voiceoverText: script.text, voiceoverVoice: settings.voiceoverVoice || 'tongtong' },
        })
        await updateVideoProgress(videoId, 56, 'Synthesizing voiceover audio (TTS)')
        const audioBuffer = await generateTTS(script.text, settings.voiceoverVoice || 'tongtong', 1.0)
        voiceoverPath = video.originalPath + '.voiceover.wav'
        const { promises: fs } = await import('fs')
        await fs.writeFile(voiceoverPath, audioBuffer)
        await db.video.update({ where: { id: videoId }, data: { voiceoverPath } })
      } catch (err: any) {
        console.error('Voiceover generation failed:', err)
        // Continue without voiceover
      }
    }

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
      // Voiceover
      voiceoverPath,
      voiceoverVolume: settings.voiceoverVolume ?? 1.0,
      voiceoverReplaceOriginal: settings.voiceoverReplaceOriginal ?? false,
    }, (pct) => {
      // ffmpeg progress
      const total = 60 + Math.floor(pct * 0.3)
      updateVideoProgress(videoId, total, 'Rendering video')
    })

    // STEP 5: Thumbnail (16:9 default — for backward compat)
    await updateVideoProgress(videoId, 90, 'Generating thumbnail')
    const thumbName = path.basename(outputPath, '.mp4') + '.jpg'
    const thumbPath = path.join(path.dirname(video.originalPath), '..', 'thumbnails', thumbName)
    await extractThumbnail(outputPath, thumbPath).catch(() => {})

    // STEP 6: Generate multi-format versions (9:16 vertical, 1:1 square, plus keep 16:9)
    // The primary processedPath is whatever the source aspect produced (often 16:9).
    // We always generate 9:16 and 1:1 versions; if the source isn't 16:9, we also generate 16:9.
    const processedFormats: Record<string, string> = {}
    const thumbnailFormats: Record<string, string> = {}
    const baseName = path.basename(outputPath, '.mp4')

    // Determine which formats to generate based on source aspect ratio
    const srcAspect = meta.width && meta.height ? meta.width / meta.height : 16/9
    const targetRatios: AspectRatio[] = ['16:9', '9:16', '1:1']
    // Skip generating a redundant version if source aspect already matches one of these
    // (we'll still generate all 3 for consistency — useful when publishing to multiple platforms)

    for (let i = 0; i < targetRatios.length; i++) {
      const ratio = targetRatios[i]
      const pct = 90 + Math.floor((i / targetRatios.length) * 8)
      await updateVideoProgress(videoId, pct, `Generating ${ratio} version`)
      const fmtOutName = `${baseName}_${ratio.replace(':', 'x')}.mp4`
      const fmtOutPath = path.join(path.dirname(video.originalPath), '..', 'processed', fmtOutName)
      try {
        await convertToAspectRatio(outputPath, fmtOutPath, ratio)
        processedFormats[ratio] = fmtOutPath
        // Per-format thumbnail
        const fmtThumbName = `${baseName}_${ratio.replace(':', 'x')}.jpg`
        const fmtThumbPath = path.join(path.dirname(video.originalPath), '..', 'thumbnails', fmtThumbName)
        await generateFormatThumbnail(fmtOutPath, fmtThumbPath, ratio).catch(() => {})
        thumbnailFormats[ratio] = fmtThumbPath
      } catch (err) {
        console.error(`Failed to generate ${ratio} version:`, err)
      }
    }

    // Use the source aspect as the "primary" processedPath if available, otherwise 16:9
    const primaryRatio: AspectRatio = srcAspect > 1.2 ? '16:9' : srcAspect < 0.8 ? '9:16' : '1:1'
    const primaryPath = processedFormats[primaryRatio] || outputPath

    await db.video.update({
      where: { id: videoId },
      data: {
        processedPath: primaryPath,
        processedFormats: JSON.stringify(processedFormats),
        thumbnailPath: thumbnailFormats[primaryRatio] || thumbPath,
        thumbnailFormats: JSON.stringify(thumbnailFormats),
        editSettings: JSON.stringify(settings),
      },
    })

    await updateVideoStatus(videoId, 'ready', 100, 'Ready to publish')
  } catch (err: any) {
    console.error('Pipeline failed:', err)
    await updateVideoStatus(videoId, 'failed', 0, undefined, err?.message || String(err))
  }
}
