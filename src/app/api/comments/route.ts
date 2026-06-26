import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchAndProcessComments } from '@/lib/comments'

export const runtime = 'nodejs'

// GET: list comments with their suggested replies
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const comments = await db.comment.findMany({
    where: status === 'all' ? {} : { replyStatus: status },
    include: { post: { include: { video: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({
    comments: comments.map(c => ({
      id: c.id,
      platform: c.platform,
      authorName: c.authorName,
      authorHandle: c.authorHandle,
      text: c.text,
      replyStatus: c.replyStatus,
      replyText: c.replyText,
      replyError: c.replyError,
      repliedAt: c.repliedAt,
      videoTitle: c.post?.video?.aiTitle || c.post?.title,
      videoThumbnail: c.post?.video?.id ? `/api/videos/${c.post.video.id}/thumbnail` : null,
      postUrl: c.post?.platformUrl,
      createdAt: c.createdAt,
    })),
  })
}

// POST: fetch new comments + generate AI replies (manual trigger or cron)
export async function POST() {
  const result = await fetchAndProcessComments()
  return NextResponse.json({ ok: true, ...result })
}

// Cron endpoint
export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const urlSecret = req.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret) {
    const provided = authHeader?.replace('Bearer ', '') || urlSecret
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  const result = await fetchAndProcessComments()
  return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
}
