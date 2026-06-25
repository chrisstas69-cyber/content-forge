import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const v = await db.video.findUnique({ where: { id } })
  if (!v?.processedPath) return NextResponse.json({ error: 'Not processed yet' }, { status: 404 })
  const buf = await fs.readFile(v.processedPath)
  const filename = path.basename(v.processedPath)
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
