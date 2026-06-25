import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Returns posts grouped by date for calendar display
export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const month = url.searchParams.get('month') // YYYY-MM format
  const year = parseInt(month?.split('-')[0] || new Date().getFullYear().toString())
  const monthNum = parseInt(month?.split('-')[1] || (new Date().getMonth() + 1).toString())

  // Get start and end of month
  const start = new Date(year, monthNum - 1, 1)
  const end = new Date(year, monthNum, 0, 23, 59, 59)

  // Fetch posts in date range (both scheduled and published)
  const posts = await db.post.findMany({
    where: {
      OR: [
        { status: 'scheduled', scheduledAt: { gte: start, lte: end } },
        { status: 'published', publishedAt: { gte: start, lte: end } },
        { status: 'failed', updatedAt: { gte: start, lte: end } },
      ],
    },
    include: {
      video: { select: { id: true, aiTitle: true, filename: true, thumbnailPath: true } },
      account: { select: { id: true, platform: true, handle: true } },
    },
    orderBy: [{ scheduledAt: 'asc' }, { publishedAt: 'asc' },
  ],
  })

  // Group by date (YYYY-MM-DD)
  const byDate: Record<string, any[]> = {}
  for (const p of posts) {
    const date = (p.scheduledAt || p.publishedAt || p.updatedAt).toISOString().split('T')[0]
    if (!byDate[date]) byDate[date] = []
    byDate[date].push({
      id: p.id,
      platform: p.platform,
      status: p.status,
      title: p.title || p.video?.aiTitle || p.video?.filename,
      thumbnailUrl: p.video?.id ? `/api/videos/${p.video.id}/thumbnail` : null,
      accountHandle: p.account?.handle,
      scheduledAt: p.scheduledAt,
      publishedAt: p.publishedAt,
      platformUrl: p.platformUrl,
      errorMessage: p.errorMessage,
      time: (p.scheduledAt || p.publishedAt || p.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    })
  }

  return NextResponse.json({
    month: `${year}-${String(monthNum).padStart(2, '0')}`,
    totalPosts: posts.length,
    byDate,
  })
}
