import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { platforms, pickFormatForPlatform } from '@/lib/social'
import { generatePlatformCaptions } from '@/lib/ai'
import { emit } from '@/lib/event-bus'

export const runtime = 'nodejs'
export const maxDuration = 300

async function publishPost(postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: { video: true, account: true },
  })
  if (!post || !post.video?.processedPath) {
    await db.post.update({
      where: { id: postId },
      data: { status: 'failed', errorMessage: 'Video not processed or missing' },
    })
    return
  }
  try {
    await db.post.update({ where: { id: post.id }, data: { status: 'uploading' } })
    emit({ type: 'post.update', postId: post.id, data: { status: 'uploading' }, timestamp: Date.now() })

    const platform = platforms[post.account.platform]
    if (!platform) throw new Error(`Unknown platform: ${post.account.platform}`)

    // Pick the best format for this platform
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
  }
}

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

  // NEW: scheduling support
  const scheduleMode: 'now' | 'schedule' | 'optimal' = body.scheduleMode || 'now'
  const scheduledAtRaw: string | undefined = body.scheduledAt

  if (platforms_.length === 0) {
    return NextResponse.json({ error: 'No platforms selected' }, { status: 400 })
  }

  const accounts = await db.socialAccount.findMany({
    where: { platform: { in: platforms_ }, connected: true },
  })

  if (accounts.length === 0) {
    return NextResponse.json({ error: 'No connected accounts for selected platforms' }, { status: 400 })
  }

  // NEW: Generate platform-specific caption variants
  let platformCaptions: any = null
  try {
    const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
    const handleSetting = await db.setting.findUnique({ where: { id: 'brand.handle' } })
    platformCaptions = await generatePlatformCaptions(
      title, description, hashtags, v.transcription || '',
      { niche: nicheSetting?.value, brandHandle: handleSetting?.value },
    )
  } catch (err) {
    console.error('Platform caption generation failed:', err)
  }

  // Create post records — one per account, with platform-specific captions
  const posts: any[] = []
  for (const acct of accounts) {
    let scheduledAt: Date | null = null
    if (scheduleMode === 'schedule' && scheduledAtRaw) {
      scheduledAt = new Date(scheduledAtRaw)
    } else if (scheduleMode === 'optimal') {
      scheduledAt = await getNextOptimalTime(acct.platform)
    }

    // Use platform-specific caption if available
    let postTitle = title
    let postDescription = description
    let postHashtags = hashtags
    if (platformCaptions) {
      const pc = platformCaptions[acct.platform]
      if (pc) {
        if (pc.title) postTitle = pc.title
        if (pc.description) postDescription = pc.description
        if (pc.caption) postDescription = pc.caption
        if (pc.hashtags) postHashtags = pc.hashtags
        if (pc.text) { postTitle = pc.text; postDescription = ''; postHashtags = [] }
      }
    }

    const post = await db.post.create({
      data: {
        videoId: v.id,
        accountId: acct.id,
        platform: acct.platform,
        status: scheduledAt ? 'scheduled' : 'pending',
        title: postTitle,
        description: postDescription,
        hashtags: JSON.stringify(postHashtags),
        scheduledAt,
      },
    })
    posts.push(post)
  }

  // If publishing now, fire off immediately
  if (scheduleMode === 'now') {
    after(async () => {
      for (const post of posts) {
        await publishPost(post.id)
      }
      await db.video.update({ where: { id: v.id }, data: { status: 'published' } })
    })
  }

  return NextResponse.json({
    posts: posts.map(p => ({
      id: p.id,
      platform: p.platform,
      status: p.status,
      scheduledAt: p.scheduledAt,
    })),
    scheduled: scheduleMode !== 'now',
    platformCaptions: platformCaptions ? Object.keys(platformCaptions) : [],
  })
}

// Optimal posting times per platform (defaults)
const DEFAULT_OPTIMAL_TIMES: Record<string, { hour: number; minute: number }[]> = {
  youtube:   [{ hour: 15, minute: 0 }, { hour: 12, minute: 0 }],
  tiktok:    [{ hour: 9, minute: 0 }, { hour: 12, minute: 0 }, { hour: 19, minute: 0 }],
  instagram: [{ hour: 11, minute: 0 }, { hour: 14, minute: 0 }, { hour: 19, minute: 0 }],
  facebook:  [{ hour: 9, minute: 0 }, { hour: 13, minute: 0 }],
  x:         [{ hour: 9, minute: 0 }, { hour: 12, minute: 0 }, { hour: 17, minute: 0 }],
}

// NEW: Smart scheduling — uses analytics data to find when THIS user's audience is most active
async function getNextOptimalTime(platform: string): Promise<Date> {
  // Try to find optimal times from this user's actual analytics
  const customTimes = await db.setting.findUnique({ where: { id: `optimal_times.${platform}` } })
  let slots: { hour: number; minute: number }[]
  if (customTimes) {
    try {
      slots = JSON.parse(customTimes.value)
    } catch {
      slots = DEFAULT_OPTIMAL_TIMES[platform] || DEFAULT_OPTIMAL_TIMES.youtube
    }
  } else {
    slots = DEFAULT_OPTIMAL_TIMES[platform] || DEFAULT_OPTIMAL_TIMES.youtube
  }

  const now = new Date()
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    for (const slot of slots) {
      const candidate = new Date(now)
      candidate.setDate(candidate.getDate() + dayOffset)
      candidate.setHours(slot.hour, slot.minute, 0, 0)
      if (candidate.getTime() > now.getTime() + 5 * 60 * 1000) {
        return candidate
      }
    }
  }
  return new Date(Date.now() + 24 * 60 * 60 * 1000)
}
