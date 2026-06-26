import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTrends } from '@/lib/trends'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const platform = url.searchParams.get('platform') || undefined
  const niche = url.searchParams.get('niche') || undefined
  const limit = parseInt(url.searchParams.get('limit') || '50')

  // Default niche: read from settings
  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const effectiveNiche = niche || nicheSetting?.value || 'pet content'

  const trends = await getTrends({ platform, niche: effectiveNiche, limit })

  // Group by platform for the UI
  const byPlatform: Record<string, any[]> = {}
  for (const t of trends) {
    if (!byPlatform[t.platform]) byPlatform[t.platform] = []
    byPlatform[t.platform].push({
      id: t.id,
      type: t.type,
      content: t.content,
      summary: t.summary,
      score: t.score,
      freshness: t.freshness,
    })
  }

  return NextResponse.json({
    niche: effectiveNiche,
    totalTrends: trends.length,
    byPlatform,
    trends: trends.map(t => ({
      id: t.id,
      platform: t.platform,
      type: t.type,
      content: t.content,
      summary: t.summary,
      score: t.score,
      freshness: t.freshness,
    })),
  })
}
