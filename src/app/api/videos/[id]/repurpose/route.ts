import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { repurposeVideo, suggestClips } from '@/lib/repurpose'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST: trigger full repurposing (suggest + extract + process each clip)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const v = await db.video.findUnique({ where: { id } })
  if (!v) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  if (!v.processedPath) return NextResponse.json({ error: 'Video not processed yet' }, { status: 400 })
  if (!v.transcription) return NextResponse.json({ error: 'Video has no transcription' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const clipCount = body.clipCount || 5

  // Run in background — this can take minutes
  after(async () => {
    try {
      await repurposeVideo(id, { clipCount, autoProcess: true })
    } catch (err: any) {
      console.error('Repurpose failed:', err)
    }
  })

  return NextResponse.json({
    ok: true,
    message: `Repurposing started — extracting up to ${clipCount} clips. Check the Library in a few minutes.`,
  })
}

// GET: preview clip suggestions without extracting
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const url = req.nextUrl
  const preview = url.searchParams.get('preview') === 'true'
  const v = await db.video.findUnique({ where: { id } })
  if (!v) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  if (!v.transcription) return NextResponse.json({ error: 'Video has no transcription' }, { status: 400 })

  if (preview) {
    const { clips } = await suggestClips(id, 5)
    return NextResponse.json({ clips })
  }

  // Otherwise list existing clips
  const clips = await db.video.findMany({
    where: { parentId: id },
    orderBy: { clipStart: 'asc' },
  })
  return NextResponse.json({
    clips: clips.map(c => ({
      id: c.id,
      title: c.aiTitle || c.filename,
      status: c.status,
      progress: c.progress,
      viralScore: c.viralScore,
      start: c.clipStart,
      end: c.clipEnd,
      thumbnailUrl: c.thumbnailPath ? `/api/videos/${c.id}/thumbnail` : null,
      formats: c.processedFormats ? Object.keys(JSON.parse(c.processedFormats)) : [],
      createdAt: c.createdAt,
    })),
  })
}
