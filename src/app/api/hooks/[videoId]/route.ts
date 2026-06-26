import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateHookVariants } from '@/lib/hooks'
import { getHookInsights } from '@/lib/hooks'

export const runtime = 'nodejs'

// GET: list hook variants for a video + overall hook insights
export async function GET(req: NextRequest, ctx: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await ctx.params
  const variants = await db.hookVariant.findMany({
    where: { videoId },
    orderBy: { createdAt: 'desc' },
  })
  const insights = await getHookInsights()
  return NextResponse.json({
    variants: variants.map(v => ({
      id: v.id,
      hookText: v.hookText,
      hookStyle: v.hookStyle,
      isWinner: v.isWinner,
      performance: v.performance ? JSON.parse(v.performance) : null,
      postId: v.postId,
    })),
    insights,
  })
}

// POST: generate 5 new hook variants
export async function POST(req: NextRequest, ctx: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await ctx.params
  const result = await generateHookVariants(videoId)
  return NextResponse.json({ ok: true, hooks: result.hooks })
}
