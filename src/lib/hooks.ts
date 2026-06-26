import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

let zaiInstance: any = null
async function getZai() {
  if (!zaiInstance) zaiInstance = await ZAI.create()
  return zaiInstance
}

export interface HookSuggestion {
  hookText: string
  hookStyle: string  // question | bold-claim | curiosity | stat | story
  predictedScore: number
  reasoning: string
}

/**
 * Generate 5 hook variants for a video's opening 3 seconds.
 * Each is a different style: question, bold claim, curiosity gap, stat, story.
 */
export async function generateHookVariants(videoId: string): Promise<{ hooks: HookSuggestion[] }> {
  const video = await db.video.findUnique({ where: { id: videoId } })
  if (!video) throw new Error('Video not found')

  const zai = await getZai()
  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const niche = nicheSetting?.value || 'pet content'

  const transcriptExcerpt = (video.transcription || '').slice(0, 500)

  const prompt = `You are a viral video hook specialist for ${niche} content.
Generate 5 different opening hooks for this video. Each hook is a short text overlay shown in the first 3 seconds.

Video title: ${video.aiTitle || video.filename}
Video description: ${video.aiDescription || ''}
Transcript excerpt: ${transcriptExcerpt || '(no transcript)'}

Generate 5 hooks, ONE of each style:
1. QUESTION — ask something that makes them need to know the answer
2. BOLD CLAIM — a surprising statement that challenges belief
3. CURIOSITY GAP — tease something without revealing it
4. STAT — a number or fact that shocks
5. STORY — "here's what happened when..." opening

Each hook should be:
- Under 60 characters (fits as text overlay)
- Impossible to scroll past
- Specific to ${niche} content
- Different from the others

Return ONLY a JSON array:
[{
  "hookText": "...",
  "hookStyle": "question",
  "predictedScore": 85,
  "reasoning": "why this hook works"
}]`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON arrays.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
  })

  const content = result.choices?.[0]?.message?.content || ''
  const match = content.match(/\[[\s\S]*\]/)
  if (!match) return { hooks: [] }

  let hooks: HookSuggestion[]
  try {
    hooks = JSON.parse(match[0])
  } catch {
    return { hooks: [] }
  }

  // Save to DB
  for (const h of hooks) {
    if (!h.hookText) continue
    await db.hookVariant.create({
      data: {
        videoId,
        hookText: h.hookText,
        hookStyle: h.hookStyle || 'question',
        isWinner: false,
      },
    })
  }

  return { hooks }
}

/**
 * After 24h of a post being live, check which hook performed best
 * and mark the winner. This is called by the analytics refresh cron.
 */
export async function evaluateHookWinners(): Promise<{ evaluated: number }> {
  // Find posts published 24+ hours ago that have hook variants
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const posts = await db.post.findMany({
    where: {
      status: 'published',
      publishedAt: { lte: oneDayAgo },
    },
    include: {
      video: { include: { hookVariants: true } },
      analytics: { orderBy: { fetchedAt: 'desc' }, take: 1 },
    },
  })

  let evaluated = 0
  for (const post of posts) {
    if (post.video?.hookVariants?.length === 0) continue
    // Get the latest analytics for this post
    const latest = post.analytics[0]
    if (!latest) continue
    const metrics = JSON.parse(latest.metrics)

    // For each hook variant on this video, record performance
    for (const hv of post.video.hookVariants) {
      if (hv.performance) continue  // already evaluated
      await db.hookVariant.update({
        where: { id: hv.id },
        data: {
          postId: post.id,
          performance: JSON.stringify({
            views: metrics.views || 0,
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
            engagement: (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0),
          }),
        },
      })
    }

    // Find the winning hook (highest engagement) across all posts for this video
    const allHooksForVideo = await db.hookVariant.findMany({
      where: { videoId: post.videoId, performance: { not: null } },
    })
    if (allHooksForVideo.length > 0) {
      const winner = allHooksForVideo.reduce((best, h) => {
        const perf = JSON.parse(h.performance || '{}')
        const bestPerf = JSON.parse(best.performance || '{}')
        return (perf.engagement || 0) > (bestPerf.engagement || 0) ? h : best
      })
      await db.hookVariant.update({
        where: { id: winner.id },
        data: { isWinner: true },
      })
    }
    evaluated++
  }

  return { evaluated }
}

/**
 * Get hook performance summary — which styles work best for this user
 */
export async function getHookInsights(): Promise<{ byStyle: Record<string, { count: number; avgEngagement: number }> }> {
  const hooks = await db.hookVariant.findMany({
    where: { performance: { not: null } },
  })
  const byStyle: Record<string, { count: number; totalEngagement: number }> = {}
  for (const h of hooks) {
    const perf = JSON.parse(h.performance || '{}')
    if (!byStyle[h.hookStyle]) byStyle[h.hookStyle] = { count: 0, totalEngagement: 0 }
    byStyle[h.hookStyle].count++
    byStyle[h.hookStyle].totalEngagement += perf.engagement || 0
  }
  const result: Record<string, { count: number; avgEngagement: number }> = {}
  for (const [style, data] of Object.entries(byStyle)) {
    result[style] = {
      count: data.count,
      avgEngagement: Math.round(data.totalEngagement / data.count),
    }
  }
  return { byStyle: result }
}
