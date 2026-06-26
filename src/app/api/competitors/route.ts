import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCompetitorAlerts } from '@/lib/competitors'

export const runtime = 'nodejs'

// GET: list competitors + recent alerts
export async function GET() {
  const competitors = await db.competitor.findMany({
    include: { posts: { take: 5, orderBy: { fetchedAt: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  })
  const alerts = await getCompetitorAlerts()
  return NextResponse.json({
    competitors: competitors.map(c => ({
      id: c.id,
      platform: c.platform,
      handle: c.handle,
      displayName: c.displayName,
      active: c.active,
      lastChecked: c.lastChecked,
      postCount: c.posts.length,
    })),
    alerts,
  })
}

// POST: add a competitor
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { platform, handle, displayName } = body
  if (!platform || !handle) {
    return NextResponse.json({ error: 'platform and handle required' }, { status: 400 })
  }
  const competitor = await db.competitor.upsert({
    where: { platform_handle: { platform, handle: handle.replace('@', '') } },
    create: { platform, handle: handle.replace('@', ''), displayName, active: true },
    update: { displayName, active: true },
  })
  return NextResponse.json({ competitor })
}

// DELETE: remove a competitor
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await db.competitor.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
