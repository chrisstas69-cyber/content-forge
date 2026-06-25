import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { saveUploadedFile, ensureDirs } from '@/lib/storage'
import { processVideoPipeline, EditSettings } from '@/lib/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    await ensureDirs()
    const formData = await req.formData()
    const file = formData.get('video') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No video file provided' }, { status: 400 })
    }
    const settingsRaw = formData.get('settings') as string | null
    const settings: EditSettings = settingsRaw ? JSON.parse(settingsRaw) : {
      burnCaptions: true,
      watermarkPosition: 'bottom-right',
      watermarkOpacity: 0.7,
      watermarkScale: 0.15,
      musicVolume: 0.2,
      originalVolume: 1.0,
      autoTrimSilence: false,
    }

    const saved = await saveUploadedFile(file, file.name)
    const video = await db.video.create({
      data: {
        filename: file.name,
        originalPath: saved.path,
        sizeBytes: saved.size,
        mimeType: saved.mimeType,
        status: 'pending',
        editSettings: JSON.stringify(settings),
      },
    })

    // Fire and forget — runs in background
    after(() => processVideoPipeline(video.id, settings).catch(err => {
      console.error('Pipeline error:', err)
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
