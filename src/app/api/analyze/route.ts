import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyzeScript } from '@/lib/script-analysis'

export const runtime = 'nodejs'
export const maxDuration = 300

// GET: list analyzed scripts
export async function GET(req: NextRequest) {
  const sort = req.nextUrl.searchParams.get('sort') || 'recent'
  let orderBy: any = { createdAt: 'desc' }
  if (sort === 'viral') orderBy = { viralScore: 'desc' }

  const scripts = await db.analyzedScript.findMany({
    orderBy,
    take: 50,
  })
  return NextResponse.json({
    scripts: scripts.map(s => ({
      id: s.id,
      url: s.url,
      platform: s.platform,
      title: s.title,
      thumbnailUrl: s.thumbnailUrl,
      hookText: s.hookText,
      patternInterrupt: s.patternInterrupt,
      bodyText: s.bodyText,
      ctaText: s.ctaText,
      psychologyTriggers: s.psychologyTriggers ? JSON.parse(s.psychologyTriggers) : [],
      framework: s.framework ? JSON.parse(s.framework) : null,
      viralScore: s.viralScore,
      analysisNotes: s.analysisNotes,
      adaptedScript: s.adaptedScript,
      createdAt: s.createdAt,
    })),
  })
}

// POST: analyze a single video URL
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { url, adaptForNiche, niche } = body

  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  try {
    const result = await analyzeScript(url, { adaptForNiche, niche })
    return NextResponse.json({ ok: true, analysis: result.analysis, title: result.title, thumbnailUrl: result.thumbnailUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Analysis failed' }, { status: 500 })
  }
}
