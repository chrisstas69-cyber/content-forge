import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { platforms, pickFormatForPlatform } from '@/lib/social'
import { emit } from '@/lib/event-bus'

export const runtime = 'nodejs'
export const maxDuration = 300

// Vercel Cron hits this endpoint every minute.
// It finds all posts with status='scheduled' and scheduledAt <= now, then publishes them.
// Protected by CRON_SECRET — set this in Vercel env vars.

export async function GET(req: NextRequest) {
  // Verify auth (Vercel Cron sends ?secret=CRON_SECRET)
  const authHeader = req.headers.get('authorization')
  const urlSecret = req.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret) {
    const provided = authHeader?.replace('Bearer ', '') || urlSecret
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  const duePosts = await db.post.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { lte: now },
    },
    include: { video: true, account: true },
    take: 20, // process at most 20 per run to avoid timeouts
  })

  const results: { postId: string; platform: string; success: boolean; error?: string }[] = []

  for (const post of duePosts) {
    try {
      if (!post.video?.processedPath) {
        throw new Error('Video not processed')
      }
      await db.post.update({ where: { id: post.id }, data: { status: 'uploading' } })
      emit({ type: 'post.update', postId: post.id, data: { status: 'uploading' }, timestamp: Date.now() })

      const platform = platforms[post.account.platform]
      if (!platform) throw new Error(`Unknown platform: ${post.account.platform}`)

      const processedFormats = post.video.processedFormats
        ? JSON.parse(post.video.processedFormats)
        : null
      const videoPath = pickFormatForPlatform(
        post.account.platform,
        processedFormats,
        post.video.processedPath,
      )

      const hashtags = post.hashtags ? JSON.parse(post.hashtags) : []
      const result = await platform.publish(post.account, {
        videoPath,
        thumbnailPath: post.video.thumbnailPath || undefined,
        title: post.title || post.video.aiTitle || post.video.filename,
        description: post.description || post.video.aiDescription || '',
        caption: post.video.aiCaption || '',
        hashtags,
      })

      await db.post.update({
        where: { id: post.id },
        data: {
          status: 'published',
          platformPostId: result.platformPostId,
          platformUrl: result.platformUrl,
          publishedAt: new Date(),
        },
      })
      emit({
        type: 'post.update',
        postId: post.id,
        data: { status: 'published', platformUrl: result.platformUrl },
        timestamp: Date.now(),
      })
      results.push({ postId: post.id, platform: post.platform, success: true })
    } catch (err: any) {
      await db.post.update({
        where: { id: post.id },
        data: { status: 'failed', errorMessage: err?.message || String(err) },
      })
      emit({
        type: 'post.update',
        postId: post.id,
        data: { status: 'failed', error: err?.message },
        timestamp: Date.now(),
      })
      results.push({ postId: post.id, platform: post.platform, success: false, error: err?.message })
    }
  }

  return NextResponse.json({
    processed: duePosts.length,
    results,
    timestamp: now.toISOString(),
  })
}
