import { NextRequest, NextResponse } from 'next/server'
import { bulkAnalyze } from '@/lib/script-analysis'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST: analyze multiple URLs at once
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { urls, adaptForNiche, niche } = body

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'urls array required' }, { status: 400 })
  }

  if (urls.length > 20) {
    return NextResponse.json({ error: 'Maximum 20 URLs per bulk analysis' }, { status: 400 })
  }

  try {
    const result = await bulkAnalyze(urls, { adaptForNiche, niche })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Bulk analysis failed' }, { status: 500 })
  }
}
