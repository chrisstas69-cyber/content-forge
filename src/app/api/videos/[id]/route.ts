import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const video = await db.video.findUnique({ where: { id }, include: { posts: true } })
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ video: serializeVideo(video) })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const v = await db.video.findUnique({ where: { id } })
  if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Delete files
  for (const p of [v.originalPath, v.processedPath, v.thumbnailPath].filter(Boolean) as string[]) {
    try { await fs.unlink(p) } catch {}
  }
  await db.video.delete({ where: { id } })
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
