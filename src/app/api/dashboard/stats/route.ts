import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const total = await db.video.count()
  const ready = await db.video.count({ where: { status: 'ready' } })
  const published = await db.video.count({ where: { status: 'published' } })
  const failed = await db.video.count({ where: { status: 'failed' } })
  const processing = await db.video.count({ where: { status: { in: ['pending', 'editing', 'transcribing', 'scoring'] } } })

  const accounts = await db.socialAccount.findMany({ where: { connected: true } })
  const posts = await db.post.count()
  const publishedPosts = await db.post.count({ where: { status: 'published' } })

  // Average viral score
  const all = await db.video.findMany({ where: { viralScore: { not: null } }, select: { viralScore: true } })
  const avgScore = all.length > 0 ? Math.round(all.reduce((a, v) => a + (v.viralScore || 0), 0) / all.length) : 0

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentVideos = await db.video.count({ where: { createdAt: { gte: sevenDaysAgo } } })

  // Scheduled posts
  const scheduled = await db.post.count({ where: { status: 'scheduled' } })
  const totalFormats = await db.video.count({ where: { NOT: { processedFormats: null } } })

  return NextResponse.json({
    total,
    ready,
    published,
    failed,
    processing,
    connectedAccounts: accounts.length,
    accountsByPlatform: accounts.reduce((acc: Record<string, number>, a) => {
      acc[a.platform] = (acc[a.platform] || 0) + 1
      return acc
    }, {}),
    totalPosts: posts,
    publishedPosts,
    avgViralScore: avgScore,
    recentVideos,
    scheduled,
    totalFormats,
  })
}
