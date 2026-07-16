import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'fs'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const asset = await db.generatedAsset.findUnique({ where: { id } })
  if (!asset || !asset.filePath) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  let buf: Buffer
  if (asset.filePath.startsWith('supabase://content-media/')) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const storagePath = asset.filePath.slice('supabase://content-media/'.length)
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { data, error } = await supabase.storage.from('content-media').download(storagePath)
    if (error || !data) return NextResponse.json({ error: 'Generated file is unavailable' }, { status: 404 })
    buf = Buffer.from(await data.arrayBuffer())
  } else {
    try {
      buf = await fs.readFile(asset.filePath)
    } catch {
      return NextResponse.json({ error: 'This older generated file has expired. Generate it again.' }, { status: 410 })
    }
  }
  const contentType = asset.type === 'broll' ? 'video/mp4' : 'image/png'
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
