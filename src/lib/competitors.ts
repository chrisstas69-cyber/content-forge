import { db } from '@/lib/db'
import { getZai } from '@/lib/ai'
import { getSecret } from '@/lib/secrets'

// ---- Fetch competitor posts per platform ----

interface CompetitorPostData {
  platformPostId: string
  title?: string
  description?: string
  url: string
  metrics?: { views?: number; likes?: number; comments?: number; shares?: number }
  postedAt?: Date
}

async function fetchYouTubeCompetitorPosts(handle: string, accessToken?: string): Promise<CompetitorPostData[]> {
  try {
    // Search for the channel by handle
    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=1`)
    const searchData = await searchRes.json()
    const channelId = searchData.items?.[0]?.id?.channelId
    if (!channelId) return []

    // Get recent videos
    const videosRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=10&order=date&type=video`)
    const videosData = await videosRes.json()
    return (videosData.items || []).map((item: any) => ({
      platformPostId: item.id?.videoId || '',
      title: item.snippet?.title,
      description: item.snippet?.description,
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      postedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : undefined,
    })).filter((v: any) => v.platformPostId)
  } catch { return [] }
}

async function fetchInstagramCompetitorPosts(handle: string, accessToken?: string): Promise<CompetitorPostData[]> {
  // IG business account search requires app review — fallback to public profile scraping via web search
  return []
}

async function fetchTikTokCompetitorPosts(handle: string, accessToken?: string): Promise<CompetitorPostData[]> {
  // TikTok doesn't have public competitor post APIs without research tier
  return []
}

async function fetchXCompetitorPosts(handle: string, accessToken?: string): Promise<CompetitorPostData[]> {
  try {
    // Search for recent tweets by this user
    const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?query=from:${handle}&max_results=10&tweet.fields=public_metrics,created_at`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    return (data.data || []).map((t: any) => ({
      platformPostId: t.id,
      title: t.text?.slice(0, 80),
      description: t.text,
      url: `https://twitter.com/${handle}/status/${t.id}`,
      metrics: {
        views: t.public_metrics?.impression_count,
        likes: t.public_metrics?.like_count,
        comments: t.public_metrics?.reply_count,
        shares: t.public_metrics?.retweet_count,
      },
      postedAt: t.created_at ? new Date(t.created_at) : undefined,
    }))
  } catch { return [] }
}

async function fetchCompetitorPosts(competitor: any): Promise<CompetitorPostData[]> {
  // Get the user's connected account token for this platform
  const account = await db.socialAccount.findFirst({
    where: { platform: competitor.platform, connected: true },
  })
  const token = account?.accessToken

  switch (competitor.platform) {
    case 'youtube': return fetchYouTubeCompetitorPosts(competitor.handle, token)
    case 'instagram': return fetchInstagramCompetitorPosts(competitor.handle, token)
    case 'tiktok': return fetchTikTokCompetitorPosts(competitor.handle, token)
    case 'x': return fetchXCompetitorPosts(competitor.handle, token)
    default: return []
  }
}

// ---- AI viral score + suggested action ----

async function analyzeCompetitorPost(post: CompetitorPostData, niche: string): Promise<{ viralScore: number; suggestedAction: string }> {
  const zai = await getZai()
  const prompt = `You are a viral content analyst for ${niche} content.

Analyze this competitor's post and:
1. Estimate its viral score (0-100) based on the title, metrics, and niche
2. Suggest how the user could create their own version that's even better

Post title: ${post.title || '(no title)'}
Post description: ${(post.description || '').slice(0, 300)}
Metrics: ${JSON.stringify(post.metrics || {})}

Return ONLY a JSON object:
{
  "viralScore": 85,
  "suggestedAction": "Create a similar video about X but add Y twist. Use hashtag Z to ride the trend."
}`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 300,
  })
  const content = result.choices?.[0]?.message?.content || ''
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return { viralScore: 50, suggestedAction: '' }
  try {
    return JSON.parse(match[0])
  } catch {
    return { viralScore: 50, suggestedAction: '' }
  }
}

// ---- Main competitor monitoring pipeline ----

export async function refreshCompetitors(): Promise<{ checked: number; newPosts: number; alerts: number }> {
  const competitors = await db.competitor.findMany({ where: { active: true } })
  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const niche = nicheSetting?.value || 'pet content'

  let newPosts = 0
  let alerts = 0

  for (const competitor of competitors) {
    try {
      const posts = await fetchCompetitorPosts(competitor)
      for (const p of posts) {
        // Skip if already exists
        const existing = await db.competitorPost.findUnique({
          where: { competitorId_platformPostId: { competitorId: competitor.id, platformPostId: p.platformPostId } },
        })
        if (existing) continue

        // Analyze the post
        const analysis = await analyzeCompetitorPost(p, niche)

        // Alert if viral score >= 70
        const shouldAlert = analysis.viralScore >= 70

        await db.competitorPost.create({
          data: {
            competitorId: competitor.id,
            platformPostId: p.platformPostId,
            platform: competitor.platform,
            title: p.title,
            description: p.description,
            url: p.url,
            metrics: JSON.stringify(p.metrics || {}),
            viralScore: analysis.viralScore,
            suggestedAction: analysis.suggestedAction,
            alertSent: shouldAlert,
            postedAt: p.postedAt,
          },
        })
        newPosts++
        if (shouldAlert) alerts++
      }
      await db.competitor.update({
        where: { id: competitor.id },
        data: { lastChecked: new Date() },
      })
    } catch (err) {
      console.error(`Failed to check competitor ${competitor.handle}:`, err)
    }
  }

  return { checked: competitors.length, newPosts, alerts }
}

export async function getCompetitorAlerts(): Promise<any[]> {
  const alerts = await db.competitorPost.findMany({
    where: { alertSent: true },
    include: { competitor: true },
    orderBy: { viralScore: 'desc' },
    take: 20,
  })
  return alerts.map(a => ({
    id: a.id,
    platform: a.platform,
    competitorHandle: a.competitor.handle,
    title: a.title,
    url: a.url,
    viralScore: a.viralScore,
    suggestedAction: a.suggestedAction,
    metrics: a.metrics ? JSON.parse(a.metrics) : {},
    postedAt: a.postedAt,
    fetchedAt: a.fetchedAt,
  }))
}
