import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { generateIdeas } from '@/lib/ideation'

export const runtime = 'nodejs'
export const maxDuration = 120

// Generate fresh ideas based on current trends + insights + analytics
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const count = body.count || 5
  const niche = body.niche

  const result = await generateIdeas({ niche, count })
  return NextResponse.json({ ok: true, ...result })
}
