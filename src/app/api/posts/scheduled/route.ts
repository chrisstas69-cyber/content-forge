import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Returns all scheduled, pending, uploading, and recently-failed/published posts
// for the Scheduled tab in the UI.
export async function GET() {
  const posts = await db.post.findMany({
    where: {
      OR: [
        { status: 'scheduled' },
        { status: 'uploading' },
        { status: 'pending' },
        // Include recently published/failed for context (last 24h)
        {
          status: 'published',
          publishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        {
          status: 'failed',
          updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      ],
    },
    include: {
      video: { select: { id: true, filename: true, aiTitle: true, thumbnailPath: true, thumbnailFormats: true } },
      account: { select: { id: true, platform: true, handle: true, displayName: true } },
    },
    orderBy: [
      { status: 'asc' }, // scheduled first
      { scheduledAt: 'asc' },
    ],
    take: 100,
  })

  return NextResponse.json({
    posts: posts.map(p => ({
      id: p.id,
      videoId: p.videoId,
      platform: p.platform,
      status: p.status,
      title: p.title,
      scheduledAt: p.scheduledAt,
      publishedAt: p.publishedAt,
      platformUrl: p.platformUrl,
      errorMessage: p.errorMessage,
      account: p.account,
      video: {
        id: p.video.id,
        filename: p.video.filename,
        aiTitle: p.video.aiTitle,
        thumbnailUrl: p.video.thumbnailPath ? `/api/videos/${p.video.id}/thumbnail` : null,
      },
      createdAt: p.createdAt,
    })),
  })
}

// Cancel a scheduled post
export async function DELETE(req: Request) {
  const { id } = await req.json()
  const post = await db.post.findUnique({ where: { id } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (post.status !== 'scheduled') {
    return NextResponse.json({ error: 'Can only cancel scheduled posts' }, { status: 400 })
  }
  await db.post.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
