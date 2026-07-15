import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

function databaseErrorHint(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/P1001|Can't reach database server|ECONNREFUSED|connection/i.test(message)) {
    return 'The database cannot be reached. Check DATABASE_URL, URL-encode reserved password characters, and redeploy.'
  }

  if (/P2021|does not exist|relation .* does not exist/i.test(message)) {
    return 'The ContentForge database tables are missing. For a controlled preview migration, set RUN_LEGACY_DB_PUSH=true for one intentional Vercel deployment, review the build log, then remove the flag.'
  }

  return 'The dashboard database request failed. Open /api/dashboard/health for a safe readiness report and check the Vercel function log.'
}

export async function GET() {
  try {
    const total = await db.video.count()
    const ready = await db.video.count({ where: { status: 'ready' } })
    const published = await db.video.count({ where: { status: 'published' } })
    const failed = await db.video.count({ where: { status: 'failed' } })
    const processing = await db.video.count({ where: { status: { in: ['pending', 'editing', 'transcribing', 'scoring'] } } })

    const accounts = await db.socialAccount.findMany({ where: { connected: true } })
    const posts = await db.post.count()
    const publishedPosts = await db.post.count({ where: { status: 'published' } })

    const all = await db.video.findMany({ where: { viralScore: { not: null } }, select: { viralScore: true } })
    const avgScore = all.length > 0 ? Math.round(all.reduce((sum, video) => sum + (video.viralScore || 0), 0) / all.length) : 0

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentVideos = await db.video.count({ where: { createdAt: { gte: sevenDaysAgo } } })

    const scheduled = await db.post.count({ where: { status: 'scheduled' } })
    const totalFormats = await db.video.count({ where: { NOT: { processedFormats: null } } })

    return NextResponse.json({
      total,
      ready,
      published,
      failed,
      processing,
      connectedAccounts: accounts.length,
      accountsByPlatform: accounts.reduce((result: Record<string, number>, account) => {
        result[account.platform] = (result[account.platform] || 0) + 1
        return result
      }, {}),
      totalPosts: posts,
      publishedPosts,
      avgViralScore: avgScore,
      recentVideos,
      scheduled,
      totalFormats,
    })
  } catch (error) {
    console.error('Dashboard stats failed:', error)
    return NextResponse.json({ error: databaseErrorHint(error) }, { status: 503 })
  }
}
