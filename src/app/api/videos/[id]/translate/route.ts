import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { translateCaptions, SUPPORTED_LANGUAGES } from '@/lib/ai'

export const runtime = 'nodejs'
export const maxDuration = 120

// POST: translate the video's caption to selected languages
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const v = await db.video.findUnique({ where: { id } })
  if (!v) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

  const body = await req.json()
  const targetLangs: string[] = body.languages || []
  if (targetLangs.length === 0) {
    return NextResponse.json({ error: 'No languages selected' }, { status: 400 })
  }

  // Use AI caption + description as the text to translate
  const textToTranslate = [
    v.aiCaption || '',
    v.aiDescription || '',
    v.aiTitle || '',
  ].filter(Boolean).join('\n\n')

  if (!textToTranslate) {
    return NextResponse.json({ error: 'No caption to translate' }, { status: 400 })
  }

  const translations = await translateCaptions(textToTranslate, targetLangs)

  // Save to video record
  const existing = v.translations ? JSON.parse(v.translations) : {}
  const merged = { ...existing, ...translations }
  await db.video.update({
    where: { id },
    data: { translations: JSON.stringify(merged) },
  })

  return NextResponse.json({
    ok: true,
    translated: Object.keys(translations).length,
    translations: merged,
  })
}

// GET: list supported languages + current translations
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const v = await db.video.findUnique({ where: { id } })
  if (!v) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  const translations = v.translations ? JSON.parse(v.translations) : {}
  return NextResponse.json({
    supportedLanguages: SUPPORTED_LANGUAGES,
    translations,
  })
}
