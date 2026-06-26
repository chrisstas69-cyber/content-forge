import { NextRequest, NextResponse } from 'next/server'
import { approveAndPostReply } from '@/lib/comments'

export const runtime = 'nodejs'

// POST: approve and post a suggested reply (optionally with custom text)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  try {
    await approveAndPostReply(id, body.replyText)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

// DELETE: ignore a comment (mark as ignored)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json()
  const { db } = await import('@/lib/db')
  await db.comment.update({
    where: { id },
    data: { replyStatus: body.status || 'ignored' },
  })
  return NextResponse.json({ ok: true })
}
