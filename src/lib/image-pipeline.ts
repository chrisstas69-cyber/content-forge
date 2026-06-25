import { db } from '@/lib/db'
import { convertImageToVideo, createSlideshow, probeVideo, processVideo, convertToAspectRatio, generateFormatThumbnail, AspectRatio } from '@/lib/ffmpeg'
import { generateVoiceoverScript, generateTTS, analyzeVideoContent } from '@/lib/ai'
import { getTrendsContext } from '@/lib/trends'
import { ensureDirs, getDirs } from '@/lib/storage'
import path from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { emit } from '@/lib/event-bus'

export interface ImageEditSettings {
  perImageSec: number          // how long each image shows
  transitionSec: number        // crossfade duration between images
  burnCaptions: boolean
  voiceoverEnabled: boolean
  voiceoverVoice: string
  voiceoverTone: string
  voiceoverReplaceOriginal: boolean
  voiceoverScript?: string     // user-provided script (optional — if not provided, AI generates one)
  musicAssetId?: string
  musicVolume: number
  watermarkAssetId?: string
  watermarkPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  watermarkOpacity?: number
  watermarkScale?: number
}

async function updateStatus(videoId: string, status: string, progress: number, step?: string, error?: string) {
  await db.video.update({
    where: { id: videoId },
    data: { status, progress, currentStep: step, errorMessage: error },
  })
  emit({ type: 'video.status', videoId, data: { status, progress, currentStep: step, errorMessage: error }, timestamp: Date.now() })
}

async function getAssetPath(assetId?: string): Promise<string | undefined> {
  if (!assetId) return undefined
  const a = await db.asset.findUnique({ where: { id: assetId } })
  return a?.filePath
}

/**
 * Process uploaded images into a publishable video:
 * 1. Convert images to a video (single image = Ken Burns zoom; multiple = slideshow with crossfades)
 * 2. Generate AI voiceover script (if not provided) + synthesize TTS audio
 * 3. Generate AI title/caption/hashtags (based on the script + niche + trends)
 * 4. FFmpeg: combine image-video + voiceover + music + burned captions + watermark
 * 5. Generate multi-format output (9:16, 16:9, 1:1)
 * 6. Generate thumbnails
 */
export async function processImagePipeline(videoId: string, imagePaths: string[], settings: ImageEditSettings) {
  const video = await db.video.findUnique({ where: { id: videoId } })
  if (!video) throw new Error('Video not found')

  try {
    await ensureDirs()
    const { originals, processed: processedDir, thumbnails: thumbsDir } = getDirs()

    // STEP 1: Convert images to a video
    await updateStatus(videoId, 'editing', 10, 'Converting images to video')
    const baseVideoPath = path.join(originals, `${video.id}_slideshow.mp4`)
    if (imagePaths.length === 1) {
      const totalDuration = settings.perImageSec * 3  // single image gets 3x the per-image duration
      await convertImageToVideo(imagePaths[0], baseVideoPath, totalDuration, { fps: 30, width: 1280, height: 720 })
    } else {
      await createSlideshow(imagePaths, baseVideoPath, {
        perImageSec: settings.perImageSec,
        transitionSec: settings.transitionSec,
        fps: 30,
        width: 1280,
        height: 720,
      })
    }

    // Update the originalPath to point to the generated video (so the rest of the pipeline works)
    await db.video.update({
      where: { id: videoId },
      data: { originalPath: baseVideoPath, mimeType: 'video/mp4' },
    })

    // Probe the generated video for metadata
    const meta = await probeVideo(baseVideoPath)
    await db.video.update({
      where: { id: videoId },
      data: { durationSec: meta.duration, width: meta.width, height: meta.height },
    })

    // STEP 2: Generate voiceover script + TTS
    let voiceoverPath: string | undefined
    let scriptText = settings.voiceoverScript || ''

    await updateStatus(videoId, 'editing', 30, 'Generating AI voiceover script')

    // If user didn't provide a script, generate one based on the niche + trends
    if (!scriptText && settings.voiceoverEnabled) {
      const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
      const handleSetting = await db.setting.findUnique({ where: { id: 'brand.handle' } })
      const niche = nicheSetting?.value || 'pet content'
      const handle = handleSetting?.value || '@yourhandle'

      // Use image filename as context for the script
      const imageContext = imagePaths.length === 1
        ? `A single photo of: ${video.filename}`
        : `A slideshow of ${imagePaths.length} photos about: ${video.filename}`

      const script = await generateVoiceoverScript('', {
        niche,
        brandHandle: handle,
        videoDescription: imageContext,
        tone: settings.voiceoverTone,
      })
      scriptText = script.text
    }

    if (scriptText) {
      await db.video.update({
        where: { id: videoId },
        data: {
          voiceoverText: scriptText,
          voiceoverVoice: settings.voiceoverVoice,
          voiceoverEnabled: true,
        },
      })

      await updateStatus(videoId, 'editing', 40, 'Synthesizing voiceover audio (TTS)')
      try {
        const audioBuffer = await generateTTS(scriptText, settings.voiceoverVoice, 1.0)
        voiceoverPath = path.join(originals, `${video.id}_voiceover.wav`)
        await fs.writeFile(voiceoverPath, audioBuffer)
        await db.video.update({ where: { id: videoId }, data: { voiceoverPath } })
      } catch (err: any) {
        console.error('TTS failed:', err)
      }
    }

    // STEP 3: AI analysis — title, caption, hashtags, viral score
    // Use the script as the "transcription" since that's what the video will say
    await updateStatus(videoId, 'scoring', 55, 'Analyzing content + generating captions')
    const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
    const handleSetting = await db.setting.findUnique({ where: { id: 'brand.handle' } })
    const niche = nicheSetting?.value || 'pet content'
    const handle = handleSetting?.value || '@yourhandle'

    let trendsContext = ''
    try { trendsContext = await getTrendsContext(niche) } catch {}

    // Store the script as the transcription so it's available for caption generation
    if (scriptText) {
      await db.video.update({ where: { id: videoId }, data: { transcription: scriptText } })
    }

    const analysis = await analyzeVideoContent(scriptText, {
      niche,
      brandHandle: handle,
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

    // STEP 4: FFmpeg processing — combine everything
    await updateStatus(videoId, 'editing', 65, 'Editing video (FFmpeg)')
    const outName = path.basename(baseVideoPath, path.extname(baseVideoPath)) + '_processed.mp4'
    const outputPath = path.join(processedDir, outName)

    const watermarkPath = await getAssetPath(settings.watermarkAssetId)
    const musicPath = await getAssetPath(settings.musicAssetId)

    // Build SRT cues from the script for caption burning
    // Simple approach: split script into ~6-word chunks, distribute over video duration
    const cues: any[] = []
    if (settings.burnCaptions && scriptText) {
      const words = scriptText.split(/\s+/).filter(Boolean)
      const wordsPerCue = 5
      const totalDuration = meta.duration
      const secondsPerCue = totalDuration / Math.ceil(words.length / wordsPerCue)
      for (let i = 0; i < words.length; i += wordsPerCue) {
        const chunk = words.slice(i, i + wordsPerCue).join(' ')
        const start = (i / wordsPerCue) * secondsPerCue
        cues.push({ start, end: start + secondsPerCue, text: chunk })
      }
    }

    await processVideo(baseVideoPath, outputPath, {
      captions: cues,
      burnCaptions: settings.burnCaptions,
      watermarkPath,
      watermarkPosition: settings.watermarkPosition,
      watermarkOpacity: settings.watermarkOpacity,
      watermarkScale: settings.watermarkScale,
      musicPath,
      musicVolume: settings.musicVolume,
      originalVolume: 0,  // no original audio in slideshow
      voiceoverPath,
      voiceoverVolume: 1.0,
      voiceoverReplaceOriginal: true,  // replace since there's no original audio
    })

    // STEP 5: Multi-format output
    const processedFormats: Record<string, string> = {}
    const thumbnailFormats: Record<string, string> = {}
    const baseName = path.basename(outputPath, '.mp4')
    const targetRatios: AspectRatio[] = ['16:9', '9:16', '1:1']

    for (let i = 0; i < targetRatios.length; i++) {
      const ratio = targetRatios[i]
      const pct = 85 + Math.floor((i / targetRatios.length) * 10)
      await updateStatus(videoId, 'editing', pct, `Generating ${ratio} version`)
      const fmtOutName = `${baseName}_${ratio.replace(':', 'x')}.mp4`
      const fmtOutPath = path.join(processedDir, fmtOutName)
      try {
        await convertToAspectRatio(outputPath, fmtOutPath, ratio)
        processedFormats[ratio] = fmtOutPath
        const fmtThumbName = `${baseName}_${ratio.replace(':', 'x')}.jpg`
        const fmtThumbPath = path.join(thumbsDir, fmtThumbName)
        await generateFormatThumbnail(fmtOutPath, fmtThumbPath, ratio).catch(() => {})
        thumbnailFormats[ratio] = fmtThumbPath
      } catch (err) {
        console.error(`Failed to generate ${ratio}:`, err)
      }
    }

    const primaryRatio: AspectRatio = '16:9'
    const primaryPath = processedFormats[primaryRatio] || outputPath

    await db.video.update({
      where: { id: videoId },
      data: {
        processedPath: primaryPath,
        processedFormats: JSON.stringify(processedFormats),
        thumbnailPath: thumbnailFormats[primaryRatio] || null,
        thumbnailFormats: JSON.stringify(thumbnailFormats),
        editSettings: JSON.stringify(settings),
      },
    })

    await updateStatus(videoId, 'ready', 100, 'Ready to publish')
  } catch (err: any) {
    console.error('Image pipeline failed:', err)
    await updateStatus(videoId, 'failed', 0, undefined, err?.message || String(err))
  }
}
