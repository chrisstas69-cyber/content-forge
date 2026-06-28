import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adaptScriptForNiche, saveFramework } from '@/lib/script-analysis'

export const runtime = 'nodejs'
export const maxDuration = 120

// POST: adapt script for user's niche, or save as framework
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json()
  const action = body.action // 'adapt' | 'save-framework'

  if (action === 'adapt') {
    try {
      const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
      const handleSetting = await db.setting.findUnique({ where: { id: 'brand.handle' } })
      const niche = body.niche || nicheSetting?.value || 'pet content'
      const handle = handleSetting?.value || '@yourhandle'
      const adapted = await adaptScriptForNiche(id, niche, handle)
      return NextResponse.json({ ok: true, adaptedScript: adapted })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message }, { status: 500 })
    }
  }

  if (action === 'save-framework') {
    try {
      await saveFramework(id)
      return NextResponse.json({ ok: true, message: 'Saved to Framework Library' })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await db.analyzedScript.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
