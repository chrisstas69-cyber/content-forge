import { NextRequest, NextResponse } from 'next/server'
import { deleteSecret } from '@/lib/secrets'

export const runtime = 'nodejs'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await deleteSecret(decodeURIComponent(id))
  return NextResponse.json({ ok: true })
}
