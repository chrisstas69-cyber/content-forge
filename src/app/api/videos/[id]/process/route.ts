import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { processVideoPipeline, EditSettings } from '@/lib/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const v = await db.video.findUnique({ where: { id } })
  if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const settings: EditSettings = body.settings || (v.editSettings ? JSON.parse(v.editSettings) : {
    burnCaptions: true,
    watermarkPosition: 'bottom-right',
    watermarkOpacity: 0.7,
    watermarkScale: 0.15,
    musicVolume: 0.2,
    originalVolume: 1.0,
  })
  await db.video.update({ where: { id }, data: { status: 'pending', progress: 0, errorMessage: null } })
  after(() => processVideoPipeline(id, settings).catch(e => console.error(e)))
  return NextResponse.json({ ok: true })
}
