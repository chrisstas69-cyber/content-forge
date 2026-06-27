import { db } from '@/lib/db'
import { getZai } from '@/lib/ai'

/**
 * Analyze the user's analytics + video history to generate insights.
 * This is the learning loop — it identifies patterns, opportunities, and
 * underperformers, then feeds them back into ideation and the agent.
 */
export async function refreshInsights(): Promise<{ generated: number }> {
  const zai = await getZai()

  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const niche = nicheSetting?.value || 'pet content'

  // Gather all data
  const videos = await db.video.findMany({
    where: { viralScore: { not: null } },
    select: { id: true, aiTitle: true, viralScore: true, aiHashtags: true, transcription: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  const analyticsCaches = await db.analyticsCache.findMany({
    include: { post: true, video: true },
    orderBy: { fetchedAt: 'desc' },
    take: 100,
  })

  const trends = await db.trend.findMany({
    where: { niche, freshness: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
    orderBy: { score: 'desc' },
    take: 20,
  })

  if (videos.length === 0 && analyticsCaches.length === 0) {
    return { generated: 0 }
  }

  // Aggregate analytics by video
  const videoPerformance: Record<string, { title: string; views: number; likes: number; comments: number; shares: number; hashtags: string[] }> = {}
  for (const c of analyticsCaches) {
    const m = JSON.parse(c.metrics)
    if (!videoPerformance[c.videoId]) {
      videoPerformance[c.videoId] = {
        title: c.video?.aiTitle || c.video?.filename || 'Untitled',
        views: 0, likes: 0, comments: 0, shares: 0, hashtags: [],
      }
    }
    videoPerformance[c.videoId].views += m.views || 0
    videoPerformance[c.videoId].likes += m.likes || 0
    videoPerformance[c.videoId].comments += m.comments || 0
    videoPerformance[c.videoId].shares += m.shares || 0
    if (c.video?.aiHashtags) {
      try { videoPerformance[c.videoId].hashtags = JSON.parse(c.video.aiHashtags) } catch {}
    }
  }

  const perfArray = Object.entries(videoPerformance).map(([id, p]) => ({ id, ...p }))
  const topPerformers = perfArray.sort((a, b) => b.views - a.views).slice(0, 5)
  const underperformers = perfArray.sort((a, b) => a.views - b.views).slice(0, 3)

  // Identify hashtag patterns
  const hashtagPerf: Record<string, { count: number; totalViews: number }> = {}
  for (const p of perfArray) {
    for (const tag of p.hashtags) {
      if (!hashtagPerf[tag]) hashtagPerf[tag] = { count: 0, totalViews: 0 }
      hashtagPerf[tag].count++
      hashtagPerf[tag].totalViews += p.views
    }
  }
  const topHashtags = Object.entries(hashtagPerf)
    .map(([tag, data]) => ({ tag, avgViews: data.totalViews / data.count, count: data.count }))
    .filter(h => h.count >= 2)
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 5)

  const prompt = `You are a content performance analyst for a ${niche} creator. Analyze their data and generate actionable insights.

VIDEO PERFORMANCE DATA (last 30 videos):
${JSON.stringify(videos.map(v => ({ title: v.aiTitle, viralScore: v.viralScore, hashtags: v.aiHashtags ? JSON.parse(v.aiHashtags) : [] })), null, 2)}

ANALYTICS DATA (per video):
Top performers: ${JSON.stringify(topPerformers)}
Underperformers: ${JSON.stringify(underperformers)}
Top hashtags by avg views: ${JSON.stringify(topHashtags)}

CURRENT TRENDS:
${trends.map(t => `${t.type} on ${t.platform}: ${t.content} (score ${t.score})`).join('\n')}

Generate 5-8 insights. Each insight should be:
- Specific (cite actual numbers from the data)
- Actionable (tell them what to DO differently)
- One of these types: "pattern" (what works), "opportunity" (untapped potential), "underperformer" (what's failing), "recommendation" (strategic advice)

Return ONLY a JSON array:
[{
  "type": "pattern",
  "content": "Your puppy videos average 3x more views than training videos. Consider pivoting to more puppy content.",
  "data": { "avgPuppyViews": 5000, "avgTrainingViews": 1500 },
  "confidence": 85
}]`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON arrays.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.6,
  })

  const content = result.choices?.[0]?.message?.content || ''
  const match = content.match(/\[[\s\S]*\]/)
  if (!match) return { generated: 0 }

  let insights: any[]
  try {
    insights = JSON.parse(match[0])
  } catch {
    return { generated: 0 }
  }

  // Clear old insights for this niche (keep only latest set)
  await db.insight.deleteMany({ where: { niche } })

  let count = 0
  for (const ins of insights) {
    if (!ins.content || !ins.type) continue
    await db.insight.create({
      data: {
        type: ins.type,
        content: ins.content,
        data: JSON.stringify(ins.data || {}),
        niche,
        confidence: ins.confidence || 50,
      },
    })
    count++
  }

  return { generated: count }
}

export async function getInsights(opts: { niche?: string; type?: string; limit?: number } = {}) {
  const where: any = {}
  if (opts.niche) where.niche = opts.niche
  if (opts.type) where.type = opts.type
  return db.insight.findMany({
    where,
    orderBy: [{ confidence: 'desc' }, { freshness: 'desc' }],
    take: opts.limit || 20,
  })
}
