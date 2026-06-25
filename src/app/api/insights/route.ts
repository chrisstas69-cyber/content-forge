import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getInsights } from '@/lib/insights'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const niche = nicheSetting?.value || 'pet content'
  const type = req.nextUrl.searchParams.get('type') || undefined
  const insights = await getInsights({ niche, type, limit: 20 })
  return NextResponse.json({
    insights: insights.map(i => ({
      id: i.id,
      type: i.type,
      content: i.content,
      data: i.data ? JSON.parse(i.data) : null,
      confidence: i.confidence,
      freshness: i.freshness,
    })),
  })
}
