import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getIdeas } from '@/lib/ideation'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const status = url.searchParams.get('status') || undefined
  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const niche = nicheSetting?.value || 'pet content'
  const ideas = await getIdeas({ niche, status, limit: 50 })
  return NextResponse.json({
    ideas: ideas.map(i => ({
      id: i.id,
      title: i.title,
      concept: i.concept,
      scriptOutline: i.scriptOutline,
      format: i.format,
      predictedViralScore: i.predictedViralScore,
      source: i.source,
      sourceData: i.sourceData ? JSON.parse(i.sourceData) : null,
      status: i.status,
      createdAt: i.createdAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const idea = await db.idea.create({
    data: {
      title: body.title,
      concept: body.concept,
      scriptOutline: body.scriptOutline || '',
      format: body.format || '9:16',
      predictedViralScore: body.predictedViralScore || 50,
      source: 'manual',
      sourceData: '{}',
      niche: body.niche || 'pet content',
      status: 'new',
    },
  })
  return NextResponse.json({ idea })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await db.idea.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
