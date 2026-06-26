import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refreshInsights } from '@/lib/insights'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST() {
  const result = await refreshInsights()
  return NextResponse.json({ ok: true, ...result })
}

// Cron — refreshes insights daily
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
  const result = await refreshInsights()
  return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
}
