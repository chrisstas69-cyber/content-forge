import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { saveUploadedFile } from '@/lib/storage'
import { processVideoPipeline } from '@/lib/pipeline'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const video = await db.video.findUnique({ where: { id }, include: { posts: true } })
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ video: serializeVideo(video) })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const video = await db.video.findUnique({ where: { id } })
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const formData = await req.formData()
    const videoFile = formData.get('video') as File | null
    if (!videoFile) return NextResponse.json({ error: 'No video file provided' }, { status: 400 })

    const settingsRaw = formData.get('settings') as string | null
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {
      burnCaptions: true,
      watermarkPosition: 'bottom-right',
      watermarkOpacity: 0.7,
      watermarkScale: 0.15,
      musicVolume: 0.2,
      originalVolume: 1.0,
      autoTrimSilence: false,
      voiceoverEnabled: true,
      voiceoverVoice: 'tongtong',
      voiceoverTone: 'engaging, friendly',
      voiceoverScript: video.voiceoverText || '',
    }

    const saved = await saveUploadedFile(videoFile, videoFile.name)
    const updated = await db.video.update({
      where: { id },
      data: {
        filename: videoFile.name,
        originalPath: saved.path,
        sizeBytes: saved.size,
        mimeType: saved.mimeType,
        status: 'pending',
        editSettings: JSON.stringify(settings),
      },
    })

    after(() => processVideoPipeline(updated.id, settings).catch(err => {
      console.error('Pipeline error:', err)
    }))

    return NextResponse.json({ video: serializeVideo(updated) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { data: item } = await supabase.from('content_items').select('source_paths, output_path, thumbnail_path').eq('id', id).single()
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const paths = [...((item.source_paths as string[]) || []), item.output_path, item.thumbnail_path].filter(Boolean) as string[]
  if (paths.length) await supabase.storage.from('content-media').remove(paths)
  const { error } = await supabase.from('content_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not delete this item' }, { status: 500 })
  return NextResponse.json({ ok: true })
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
    thumbnailUrl: v.thumbnailPath ? `/api/videos/${v.id}/thumbnail` : null,
    processedUrl: v.processedPath ? `/api/videos/${v.id}/download` : null,
    posts: v.posts,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
}
