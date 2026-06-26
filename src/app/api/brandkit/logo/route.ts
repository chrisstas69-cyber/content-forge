import { NextResponse } from 'next/server'
import { getBrandKit } from '@/lib/brandkit'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'

export async function GET() {
  const kit = await getBrandKit()
  if (!kit?.logoPath) return NextResponse.json({ error: 'No logo' }, { status: 404 })
  const buf = await fs.readFile(kit.logoPath)
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
