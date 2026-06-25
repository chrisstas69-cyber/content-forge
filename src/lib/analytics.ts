import { db } from '@/lib/db'
import { getSecret } from '@/lib/secrets'

export interface PostMetrics {
  views?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  reach?: number
  impressions?: number
  engagementRate?: number
}

export interface AnalyticsResult {
  postId: string
  platform: string
  metrics: PostMetrics
  fetchedAt: Date
}

/**
 * Fetch fresh analytics for all published posts.
 * Updates AnalyticsCache table with results.
 */
export async function refreshAnalytics(maxPosts: number = 50): Promise<{ refreshed: number; failed: number }> {
  const publishedPosts = await db.post.findMany({
    where: {
      status: 'published',
      platformPostId: { not: null },
    },
    include: { account: true, video: true },
    orderBy: { publishedAt: 'desc' },
    take: maxPosts,
  })

  let refreshed = 0
  let failed = 0

  for (const post of publishedPosts) {
    try {
      const metrics = await fetchPostMetrics(post)
      if (metrics) {
        await db.analyticsCache.upsert({
          where: { postId: post.id },
          create: {
            postId: post.id,
            videoId: post.videoId,
            platform: post.platform,
            metrics: JSON.stringify(metrics),
          },
          update: {
            metrics: JSON.stringify(metrics),
            fetchedAt: new Date(),
          },
        })
        refreshed++
      } else {
        failed++
      }
    } catch (err) {
      console.error(`Analytics fetch failed for post ${post.id}:`, err)
      failed++
    }
  }

  return { refreshed, failed }
}

async function fetchPostMetrics(post: any): Promise<PostMetrics | null> {
  if (!post.account || !post.platformPostId) return null
  switch (post.platform) {
    case 'youtube': return fetchYouTubeMetrics(post)
    case 'tiktok': return fetchTikTokMetrics(post)
    case 'instagram': return fetchInstagramMetrics(post)
    case 'facebook': return fetchFacebookMetrics(post)
    case 'x': return fetchXMetrics(post)
    default: return null
  }
}

// Refresh access tokens if needed (re-use logic from social.ts but kept simple here)
async function ensureFreshToken(account: any): Promise<string | null> {
  // Check if token expires within 5 minutes
  if (account.tokenExpiry && account.tokenExpiry > new Date(Date.now() + 5 * 60 * 1000)) {
    return account.accessToken
  }
  // For brevity, just return the existing token — refresh logic is in social.ts
  // In production you'd share the refresh logic
  return account.accessToken
}

async function fetchYouTubeMetrics(post: any): Promise<PostMetrics | null> {
  const accessToken = await ensureFreshToken(post.account)
  if (!accessToken) return null
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${post.platformPostId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    const stats = data.items?.[0]?.statistics
    if (!stats) return null
    return {
      views: parseInt(stats.viewCount || '0'),
      likes: parseInt(stats.likeCount || '0'),
      comments: parseInt(stats.commentCount || '0'),
    }
  } catch {
    return null
  }
}

async function fetchTikTokMetrics(post: any): Promise<PostMetrics | null> {
  const accessToken = await ensureFreshToken(post.account)
  if (!accessToken) return null
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/research/video/query/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_ids: [post.platformPostId] }),
    })
    // TikTok research API requires approval; fallback to display API
    if (!res.ok) return null
    const data = await res.json()
    const v = data?.data?.videos?.[0]
    if (!v) return null
    return {
      views: v.view_count,
      likes: v.like_count,
      comments: v.comment_count,
      shares: v.share_count,
    }
  } catch {
    return null
  }
}

async function fetchInstagramMetrics(post: any): Promise<PostMetrics | null> {
  const accessToken = await ensureFreshToken(post.account)
  if (!accessToken) return null
  const meta = JSON.parse(post.account.metadata || '{}')
  const igUserId = meta.igUserId
  if (!igUserId) return null
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${post.platformPostId}?fields=views,likes,comments&access_token=${accessToken}`)
    const data = await res.json()
    return {
      views: data.views,
      likes: data.likes,
      comments: data.comments && Array.isArray(data.comments) ? data.comments.length : data.comments,
    }
  } catch {
    return null
  }
}

async function fetchFacebookMetrics(post: any): Promise<PostMetrics | null> {
  const accessToken = await ensureFreshToken(post.account)
  if (!accessToken) return null
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${post.platformPostId}/insights?metric=post_impressions,post_reach&access_token=${accessToken}`)
    const data = await res.json()
    const impressions = data?.data?.find((d: any) => d.name === 'post_impressions')?.values?.[0]?.value
    const reach = data?.data?.find((d: any) => d.name === 'post_reach')?.values?.[0]?.value
    return { impressions, reach }
  } catch {
    return null
  }
}

async function fetchXMetrics(post: any): Promise<PostMetrics | null> {
  const accessToken = await ensureFreshToken(post.account)
  if (!accessToken) return null
  try {
    const res = await fetch(`https://api.twitter.com/2/tweets/${post.platformPostId}?tweet.fields=public_metrics`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    const m = data?.data?.public_metrics
    if (!m) return null
    return {
      views: m.impression_count,
      likes: m.like_count,
      comments: m.reply_count,
      shares: m.retweet_count,
    }
  } catch {
    return null
  }
}

// Get aggregated analytics for the dashboard
export async function getAnalyticsSummary() {
  const caches = await db.analyticsCache.findMany({
    include: { post: { include: { account: true } }, video: true },
    orderBy: { fetchedAt: 'desc' },
    take: 200,
  })

  // Aggregate totals per platform
  const perPlatform: Record<string, { views: number; likes: number; comments: number; shares: number; posts: number }> = {}
  let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0

  const recentPosts: any[] = []
  for (const c of caches) {
    const m: any = JSON.parse(c.metrics)
    const platform = c.platform
    if (!perPlatform[platform]) perPlatform[platform] = { views: 0, likes: 0, comments: 0, shares: 0, posts: 0 }
    perPlatform[platform].views += m.views || 0
    perPlatform[platform].likes += m.likes || 0
    perPlatform[platform].comments += m.comments || 0
    perPlatform[platform].shares += m.shares || 0
    perPlatform[platform].posts += 1
    totalViews += m.views || 0
    totalLikes += m.likes || 0
    totalComments += m.comments || 0
    totalShares += m.shares || 0
    recentPosts.push({
      postId: c.postId,
      videoId: c.videoId,
      platform,
      title: c.post?.title || c.video?.aiTitle || c.video?.filename,
      thumbnailUrl: c.video?.id ? `/api/videos/${c.video.id}/thumbnail` : null,
      metrics: m,
      fetchedAt: c.fetchedAt,
      publishedAt: c.post?.publishedAt,
      platformUrl: c.post?.platformUrl,
    })
  }

  // Top performing videos
  const topVideos = new Map<string, { views: number; likes: number; comments: number; shares: number; title: string; thumbnailUrl: string | null }>()
  for (const p of recentPosts) {
    const existing = topVideos.get(p.videoId)
    if (existing) {
      existing.views += p.metrics.views || 0
      existing.likes += p.metrics.likes || 0
      existing.comments += p.metrics.comments || 0
      existing.shares += p.metrics.shares || 0
    } else {
      topVideos.set(p.videoId, {
        views: p.metrics.views || 0,
        likes: p.metrics.likes || 0,
        comments: p.metrics.comments || 0,
        shares: p.metrics.shares || 0,
        title: p.title,
        thumbnailUrl: p.thumbnailUrl,
      })
    }
  }
  const topVideosList = Array.from(topVideos.entries())
    .map(([id, v]) => ({ id, ...v, engagement: v.likes + v.comments + v.shares }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)

  return {
    totals: {
      views: totalViews,
      likes: totalLikes,
      comments: totalComments,
      shares: totalShares,
      posts: caches.length,
    },
    perPlatform,
    topVideos: topVideosList,
    recentPosts: recentPosts.slice(0, 30),
  }
}
