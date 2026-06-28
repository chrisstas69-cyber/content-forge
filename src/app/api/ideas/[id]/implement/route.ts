import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const idea = await db.idea.findUnique({ where: { id } })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

    // Create a draft video project in the library
    const video = await db.video.create({
      data: {
        filename: `Draft: ${idea.title}`,
        originalPath: '',
        sizeBytes: 0,
        mimeType: 'draft/project',
        status: 'draft',
        aiTitle: idea.title,
        aiDescription: idea.concept,
        voiceoverText: idea.scriptOutline || '',
        voiceoverEnabled: true,
        editSettings: JSON.stringify({
          burnCaptions: true,
          watermarkPosition: 'bottom-right',
          watermarkOpacity: 0.7,
          watermarkScale: 0.15,
          musicVolume: 0.2,
          originalVolume: 1.0,
          autoTrimSilence: false,
          voiceoverEnabled: true,
          voiceoverVoice: 'tongtong',
          voiceoverTone: 'engaging, friendly',
          voiceoverScript: idea.scriptOutline || '',
        }),
      },
    })

    // Mark the idea as used and link to the draft video project
    await db.idea.update({
      where: { id },
      data: {
        status: 'used',
        generatedVideoId: video.id,
      },
    })

    return NextResponse.json({ ok: true, videoId: video.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
