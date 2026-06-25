import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Mark idea as used/rejected
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json()
  const status = body.status // 'used' | 'rejected'
  const update: any = { status }
  if (status === 'used' && body.generatedVideoId) {
    update.generatedVideoId = body.generatedVideoId
  }
  const idea = await db.idea.update({ where: { id }, data: update }).catch(() => null)
  if (!idea) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ idea })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await db.idea.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
