import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const asset = await db.generatedAsset.findUnique({ where: { id } })
  if (!asset || !asset.filePath) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const buf = await fs.readFile(asset.filePath)
  const contentType = asset.type === 'broll' ? 'video/mp4' : 'image/png'
  return new NextResponse(buf, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
