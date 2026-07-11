import { NextRequest, NextResponse } from 'next/server'
import { deleteSecret } from '@/lib/secrets'
import { SECRET_FIELDS } from '@/lib/secrets'

export const runtime = 'nodejs'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const decodedId = decodeURIComponent(id)
  if (!SECRET_FIELDS.some(field => field.id === decodedId)) {
    return NextResponse.json({ error: 'Unknown credential' }, { status: 404 })
  }
  await deleteSecret(decodedId)
  return NextResponse.json({ ok: true })
}
