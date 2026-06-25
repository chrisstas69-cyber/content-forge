import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { platforms } from '@/lib/social'
import { emit } from '@/lib/event-bus'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const v = await db.video.findUnique({ where: { id } })
  if (!v) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  if (!v.processedPath) return NextResponse.json({ error: 'Video not processed yet' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const platforms_ = body.platforms as string[] || []
  const title = body.title || v.aiTitle || v.filename
  const description = body.description || v.aiDescription || ''
  const caption = body.caption || v.aiCaption || ''
  const hashtags: string[] = body.hashtags || (v.aiHashtags ? JSON.parse(v.aiHashtags) : [])

  if (platforms_.length === 0) {
    return NextResponse.json({ error: 'No platforms selected' }, { status: 400 })
  }

  const accounts = await db.socialAccount.findMany({
    where: { platform: { in: platforms_ }, connected: true },
  })

  if (accounts.length === 0) {
    return NextResponse.json({ error: 'No connected accounts for selected platforms' }, { status: 400 })
  }

  // Create post records and fire off publishing
  const posts: any[] = []
  for (const acct of accounts) {
    const post = await db.post.create({
      data: {
        videoId: v.id,
        accountId: acct.id,
        platform: acct.platform,
        status: 'pending',
        title,
        description,
        hashtags: JSON.stringify(hashtags),
      },
    })
    posts.push(post)
  }

  after(async () => {
    for (const post of posts) {
      const acct = await db.socialAccount.findUnique({ where: { id: post.accountId } })
      if (!acct) continue
      try {
        await db.post.update({ where: { id: post.id }, data: { status: 'uploading' } })
        emit({ type: 'post.update', postId: post.id, data: { status: 'uploading' }, timestamp: Date.now() })
        const platform = platforms[acct.platform]
        if (!platform) throw new Error(`Unknown platform: ${acct.platform}`)
        const result = await platform.publish(acct, {
          videoPath: v.processedPath!,
          thumbnailPath: v.thumbnailPath || undefined,
          title,
          description,
          caption,
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
        emit({ type: 'post.update', postId: post.id, data: { status: 'published', platformUrl: result.platformUrl }, timestamp: Date.now() })
      } catch (err: any) {
        await db.post.update({
          where: { id: post.id },
          data: { status: 'failed', errorMessage: err?.message || String(err) },
        })
        emit({ type: 'post.update', postId: post.id, data: { status: 'failed', error: err?.message }, timestamp: Date.now() })
      }
    }
    // Mark video as published (or partially)
    await db.video.update({ where: { id: v.id }, data: { status: 'published' } })
  })

  return NextResponse.json({ posts: posts.map(p => ({ id: p.id, platform: p.platform, status: p.status })) })
}
