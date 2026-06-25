import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refreshTrends } from '@/lib/trends'

export const runtime = 'nodejs'
export const maxDuration = 300

// Refresh trends for the configured niche. Protected by CRON_SECRET for cron use,
// but also callable from the UI with no auth (the Trends tab "Refresh" button).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const niche = body.niche
  const platforms = body.platforms || ['tiktok', 'instagram', 'youtube', 'x']

  // Resolve niche from settings if not provided
  let effectiveNiche = niche
  if (!effectiveNiche) {
    const setting = await db.setting.findUnique({ where: { id: 'content.niche' } })
    effectiveNiche = setting?.value || 'pet content'
  }

  const result = await refreshTrends(effectiveNiche, platforms)
  return NextResponse.json({ ok: true, niche: effectiveNiche, ...result })
}

// Cron endpoint — refreshes trends daily. Protected by CRON_SECRET.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const urlSecret = req.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret) {
    const provided = authHeader?.replace('Bearer ', '') || urlSecret
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Refresh for the configured niche
  const setting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const niche = setting?.value || 'pet content'

  const result = await refreshTrends(niche, ['tiktok', 'instagram', 'youtube', 'x'])
  return NextResponse.json({ ok: true, niche, ...result, timestamp: new Date().toISOString() })
}
