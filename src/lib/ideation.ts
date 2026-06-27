import { db } from '@/lib/db'
import { getZai } from '@/lib/ai'
import { getTrends } from '@/lib/trends'
import { getAnalyticsSummary } from '@/lib/analytics'

export interface ContentIdea {
  title: string
  concept: string
  scriptOutline: string
  format: string
  predictedViralScore: number
  source: string
  sourceData: any
}

/**
 * Generate content ideas based on trends, insights, and the user's analytics.
 * This is the ideation engine — it pulls all available context and asks the LLM
 * to come up with content ideas tailored to the user's niche and performance.
 */
export async function generateIdeas(opts: { niche?: string; count?: number } = {}): Promise<{ generated: number; ideas: any[] }> {
  const zai = await getZai()

  // Pull all available context
  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const niche = opts.niche || nicheSetting?.value || 'pet content'
  const handleSetting = await db.setting.findUnique({ where: { id: 'brand.handle' } })
  const handle = handleSetting?.value || '@yourhandle'

  // 1. Current trends
  const trends = await getTrends({ niche, limit: 20 })
  const trendsText = trends.length > 0
    ? trends.map(t => `- ${t.type} on ${t.platform}: ${t.content} (score ${t.score}) — ${t.summary || ''}`).join('\n')
    : 'No trend data available yet.'

  // 2. Recent insights (learning loop)
  const insights = await db.insight.findMany({
    where: { niche, freshness: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
    orderBy: { confidence: 'desc' },
    take: 10,
  })
  const insightsText = insights.length > 0
    ? insights.map(i => `- ${i.type}: ${i.content} (confidence ${i.confidence})`).join('\n')
    : 'No insights yet — publish more videos to unlock performance-based insights.'

  // 3. Analytics summary (what's worked for this user)
  let analyticsText = 'No analytics data yet.'
  try {
    const summary = await getAnalyticsSummary()
    if (summary.totals.posts > 0) {
      analyticsText = `Total: ${summary.totals.posts} posts, ${summary.totals.views} views, ${summary.totals.likes} likes.\n`
      analyticsText += `Per platform: ${Object.entries(summary.perPlatform).map(([p, m]: [string, any]) => `${p}=${m.posts}p/${m.views}v`).join(', ')}\n`
      if (summary.topVideos.length > 0) {
        analyticsText += `Top videos: ${summary.topVideos.slice(0, 5).map((v: any) => `"${v.title}" (${v.views} views)`).join('; ')}`
      }
    }
  } catch {}

  // 4. Recent videos (what they've already made)
  const recentVideos = await db.video.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { aiTitle: true, viralScore: true, aiHashtags: true },
  })
  const recentText = recentVideos.length > 0
    ? recentVideos.map(v => `- "${v.aiTitle}" (score ${v.viralScore})`).join('\n')
    : 'No videos created yet.'

  const count = opts.count || 5

  const prompt = `You are a viral content strategist for the ${niche} niche.

Generate ${count} original, high-potential content ideas for this creator.

CONTEXT:
Brand handle: ${handle}

CURRENTLY TRENDING:
${trendsText}

PERFORMANCE INSIGHTS (from their actual analytics):
${insightsText}

THEIR ANALYTICS:
${analyticsText}

THEIR RECENT VIDEOS (don't duplicate these):
${recentText}

For each idea, provide:
1. A scroll-stopping title (under 80 chars)
2. A 1-2 sentence concept description
3. A script outline (3-5 bullet points covering hook, body, CTA)
4. Best format: "9:16" (TikTok/Reels), "16:9" (YouTube), or "1:1" (IG feed)
5. Predicted viral score (0-100) based on trend alignment + hook strength
6. Source: which trend/insight/analytics point informed this idea

Ground each idea in ACTUAL trending topics and ACTUAL performance data above. Don't suggest generic ideas like "day in the life" — be specific to what's trending NOW and what's worked for THIS creator.

Return ONLY a JSON array of ${count} objects:
[{
  "title": "...",
  "concept": "...",
  "scriptOutline": "Hook: ...\\nBody: ...\\nCTA: ...",
  "format": "9:16",
  "predictedViralScore": 85,
  "source": "trends",
  "sourceData": { "trend": "dogsoftiktok", "reason": "..." }
}]`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON arrays, no extra text.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
  })

  const content = result.choices?.[0]?.message?.content || ''
  const match = content.match(/\[[\s\S]*\]/)
  if (!match) return { generated: 0, ideas: [] }

  let ideas: ContentIdea[]
  try {
    ideas = JSON.parse(match[0])
  } catch {
    return { generated: 0, ideas: [] }
  }

  // Save to DB
  const saved = []
  for (const idea of ideas) {
    if (!idea.title || !idea.concept) continue
    const row = await db.idea.create({
      data: {
        title: idea.title,
        concept: idea.concept,
        scriptOutline: idea.scriptOutline || '',
        format: idea.format || '9:16',
        predictedViralScore: idea.predictedViralScore || 50,
        source: idea.source || 'trends',
        sourceData: JSON.stringify(idea.sourceData || {}),
        niche,
        status: 'new',
      },
    })
    saved.push(row)
  }

  return { generated: saved.length, ideas: saved }
}

export async function getIdeas(opts: { niche?: string; status?: string; limit?: number } = {}) {
  const where: any = {}
  if (opts.niche) where.niche = opts.niche
  if (opts.status) where.status = opts.status
  const ideas = await db.idea.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts.limit || 50,
  })
  return ideas
}
