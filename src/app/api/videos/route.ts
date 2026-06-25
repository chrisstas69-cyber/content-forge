import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { saveUploadedFile, ensureDirs, getDirs } from '@/lib/storage'
import { processVideoPipeline, EditSettings } from '@/lib/pipeline'
import { processImagePipeline, ImageEditSettings } from '@/lib/image-pipeline'
import path from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    await ensureDirs()
    const formData = await req.formData()

    // Check for video file (existing behavior)
    const videoFile = formData.get('video') as File | null

    // Check for image files (new — supports single or multiple)
    const imageFiles: File[] = []
    const allEntries = Array.from(formData.entries())
    for (const [key, value] of allEntries) {
      if (key === 'images' && value instanceof File) {
        imageFiles.push(value)
      }
    }

    if (!videoFile && imageFiles.length === 0) {
      return NextResponse.json({ error: 'No video or image files provided' }, { status: 400 })
    }

    const settingsRaw = formData.get('settings') as string | null

    // ---- VIDEO path (existing) ----
    if (videoFile) {
      const settings: EditSettings = settingsRaw ? JSON.parse(settingsRaw) : {
        burnCaptions: true,
        watermarkPosition: 'bottom-right',
        watermarkOpacity: 0.7,
        watermarkScale: 0.15,
        musicVolume: 0.2,
        originalVolume: 1.0,
        autoTrimSilence: false,
      }

      const saved = await saveUploadedFile(videoFile, videoFile.name)
      const video = await db.video.create({
        data: {
          filename: videoFile.name,
          originalPath: saved.path,
          sizeBytes: saved.size,
          mimeType: saved.mimeType,
          status: 'pending',
          editSettings: JSON.stringify(settings),
        },
      })

      after(() => processVideoPipeline(video.id, settings).catch(err => {
        console.error('Pipeline error:', err)
      }))

      return NextResponse.json({ video: serializeVideo(video) })
    }

    // ---- IMAGE path (new) ----
    // Save all uploaded images to the originals folder
    const { originals } = getDirs()
    const savedImagePaths: string[] = []
    let totalSize = 0
    const firstImageName = imageFiles[0].name.replace(/\.[^.]+$/, '')

    for (const imgFile of imageFiles) {
      const ext = path.extname(imgFile.name) || '.jpg'
      const filename = `${randomUUID()}${ext}`
      const filepath = path.join(originals, filename)
      const buffer = Buffer.from(await imgFile.arrayBuffer())
      await fs.writeFile(filepath, buffer)
      savedImagePaths.push(filepath)
      totalSize += buffer.length
    }

    // Parse image-specific settings
    const imgSettings: ImageEditSettings = settingsRaw
      ? { ...JSON.parse(settingsRaw) }
      : {
          perImageSec: 5,
          transitionSec: 0.7,
          burnCaptions: true,
          voiceoverEnabled: true,
          voiceoverVoice: 'tongtong',
          voiceoverTone: 'funny, energetic, engaging',
          voiceoverReplaceOriginal: true,
          musicVolume: 0.2,
          watermarkPosition: 'bottom-right',
          watermarkOpacity: 0.7,
          watermarkScale: 0.15,
        }

    // Create a Video record — the originalPath will be updated by the pipeline
    // once the slideshow video is generated
    const displayName = imageFiles.length === 1
      ? firstImageName
      : `${firstImageName} (+${imageFiles.length - 1} more)`

    const video = await db.video.create({
      data: {
        filename: displayName,
        originalPath: savedImagePaths[0],  // placeholder — pipeline updates this
        sizeBytes: totalSize,
        mimeType: 'image/jpeg',
        status: 'pending',
        editSettings: JSON.stringify(imgSettings),
      },
    })

    after(() => processImagePipeline(video.id, savedImagePaths, imgSettings).catch(err => {
      console.error('Image pipeline error:', err)
    }))

    return NextResponse.json({ video: serializeVideo(video) })
  } catch (err: any) {
    console.error('Upload failed:', err)
    return NextResponse.json({ error: err?.message || 'Upload failed' }, { status: 500 })
  }
}

export async function GET() {
  const videos = await db.video.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  return NextResponse.json({ videos: videos.map(serializeVideo) })
}

function serializeVideo(v: any) {
  return {
    id: v.id,
    filename: v.filename,
    sizeBytes: v.sizeBytes,
    durationSec: v.durationSec,
    width: v.width,
    height: v.height,
    mimeType: v.mimeType,
    status: v.status,
    progress: v.progress,
    currentStep: v.currentStep,
    errorMessage: v.errorMessage,
    viralScore: v.viralScore,
    aiTitle: v.aiTitle,
    aiDescription: v.aiDescription,
    aiCaption: v.aiCaption,
    aiHashtags: v.aiHashtags ? JSON.parse(v.aiHashtags) : [],
    transcription: v.transcription,
    editSettings: v.editSettings ? JSON.parse(v.editSettings) : null,
    formats: v.processedFormats ? Object.keys(JSON.parse(v.processedFormats)) : [],
    thumbnailUrl: v.thumbnailPath ? `/api/videos/${v.id}/thumbnail` : null,
    processedUrl: v.processedPath ? `/api/videos/${v.id}/download` : null,
    isClip: v.isClip || false,
    parentId: v.parentId || null,
    clipStart: v.clipStart ?? null,
    clipEnd: v.clipEnd ?? null,
    translations: v.translations ? Object.keys(JSON.parse(v.translations)) : [],
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
}
