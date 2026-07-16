import { NextRequest, NextResponse } from 'next/server'
import { translateCaptions, SUPPORTED_LANGUAGES } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 120

async function getVideo(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Please log in again before translating.' }, { status: 401 }) }

  const { data: item, error } = await supabase
    .from('content_items')
    .select('id, filename, metadata')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (error || !item) return { error: NextResponse.json({ error: 'Video not found' }, { status: 404 }) }
  return { supabase, user, item, metadata: (item.metadata || {}) as Record<string, any> }
}

// POST: translate the uploaded video's generated title, caption, and description.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const video = await getVideo(id)
  if ('error' in video) return video.error

  const body = await req.json()
  const targetLangs: string[] = Array.isArray(body.languages) ? body.languages : []
  if (targetLangs.length === 0) return NextResponse.json({ error: 'No languages selected' }, { status: 400 })

  const textToTranslate = [
    video.metadata.aiCaption || '',
    video.metadata.aiDescription || '',
    video.metadata.aiTitle || '',
    video.item.filename || '',
  ].filter(Boolean).join('\n\n')
  if (!textToTranslate) return NextResponse.json({ error: 'No video text is available to translate yet.' }, { status: 400 })

  const translations = await translateCaptions(textToTranslate, targetLangs)
  if (Object.keys(translations).length === 0) {
    return NextResponse.json({ error: 'Translation provider did not return a result. Check the OpenRouter API key and credits.' }, { status: 502 })
  }

  const merged = { ...(video.metadata.translations || {}), ...translations }
  const { error } = await video.supabase
    .from('content_items')
    .update({ metadata: { ...video.metadata, translations: merged } })
    .eq('id', id)
    .eq('user_id', video.user.id)
  if (error) return NextResponse.json({ error: `Could not save translations: ${error.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, translated: Object.keys(translations).length, translations: merged })
}

// GET: list supported languages + translations saved with the uploaded video.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const video = await getVideo(id)
  if ('error' in video) return video.error
  return NextResponse.json({ supportedLanguages: SUPPORTED_LANGUAGES, translations: video.metadata.translations || {} })
}
