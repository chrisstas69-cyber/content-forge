import { NextRequest, NextResponse } from 'next/server'
import { refreshAnalytics } from '@/lib/analytics'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST() {
  const result = await refreshAnalytics(50)
  return NextResponse.json({ ok: true, ...result })
}

// Cron endpoint — refreshes analytics hourly
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
  const result = await refreshAnalytics(100)
  return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
}
