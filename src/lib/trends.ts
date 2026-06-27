import { db } from '@/lib/db'
import { getZai } from '@/lib/ai'

export interface TrendResult {
  platform: string
  type: string
  content: string
  summary?: string
  sourceUrl?: string
  score: number
}

/**
 * Search the web for trending content in a niche using ZAI web search,
 * then use the LLM to extract structured trends from the results.
 */
export async function refreshTrends(niche: string, platforms: string[] = ['tiktok', 'instagram', 'youtube', 'x']): Promise<{ discovered: number; saved: number }> {
  const zai = await getZai()
  let discovered = 0
  let saved = 0

  for (const platform of platforms) {
    try {
      const queries = [
        `trending ${niche} hashtags ${platform} this week`,
        `viral ${niche} content ${platform} 2026`,
        `${platform} ${niche} trends this month`,
      ]

      const allResults: { title: string; url: string; snippet: string }[] = []
      for (const query of queries) {
        try {
          const searchResult: any = await zai.functions.invoke('web_search', { query, num: 8 })
          // web_search can return results in several shapes — handle all of them
          let items: any[] = []
          if (Array.isArray(searchResult)) {
            items = searchResult
          } else if (Array.isArray(searchResult?.data)) {
            items = searchResult.data
          } else if (Array.isArray(searchResult?.data?.results)) {
            items = searchResult.data.results
          } else if (Array.isArray(searchResult?.results)) {
            items = searchResult.results
          }
          for (const item of items) {
            allResults.push({
              title: item.title || item.name || '',
              url: item.url || item.link || item.href || '',
              snippet: item.snippet || item.description || item.summary || item.content || '',
            })
          }
        } catch (err) {
          console.error(`Search failed for "${query}":`, err)
        }
      }

      if (allResults.length === 0) continue

      // Use LLM to extract structured trends from the search results
      const prompt = `You are a social media trend analyst. Based on the search results below, extract the top trending hashtags, sounds, content formats, and topics for ${platform} in the ${niche} niche.

Search results:
${allResults.slice(0, 20).map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`).join('\n\n')}

Return a JSON array (NO markdown, just JSON) of 5-10 trends. Each trend should have:
{
  "type": "hashtag" | "sound" | "format" | "topic",
  "content": "the hashtag without #, sound name, format description, or topic",
  "summary": "one sentence on why it's trending or how to use it",
  "score": 0-100 based on relevance to ${niche}
}

Return ONLY the JSON array.`

      const completion: any = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON arrays, no extra text.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
      })

      const content = completion.choices?.[0]?.message?.content || ''
      const match = content.match(/\[[\s\S]*\]/)
      if (!match) continue

      let trends: any[] = []
      try { trends = JSON.parse(match[0]) } catch { continue }

      // Save to DB (deduplicate by content+platform)
      for (const t of trends) {
        if (!t.content || !t.type) continue
        const existing = await db.trend.findFirst({
          where: { platform, content: t.content, niche },
        })
        if (existing) {
          // Update score and freshness
          await db.trend.update({
            where: { id: existing.id },
            data: {
              score: t.score || existing.score,
              summary: t.summary || existing.summary,
              freshness: new Date(),
            },
          })
        } else {
          await db.trend.create({
            data: {
              platform,
              type: t.type,
              content: t.content,
              niche,
              summary: t.summary,
              score: t.score || 50,
            },
          })
          saved++
        }
        discovered++
      }
    } catch (err) {
      console.error(`Trend refresh failed for ${platform}:`, err)
    }
  }

  return { discovered, saved }
}

export async function getTrends(opts: { niche?: string; platform?: string; limit?: number } = {}) {
  const where: any = {}
  if (opts.platform) where.platform = opts.platform
  if (opts.niche) where.niche = opts.niche

  // Filter to trends from last 14 days
  where.freshness = { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }

  const trends = await db.trend.findMany({
    where,
    orderBy: [{ score: 'desc' }, { freshness: 'desc' }],
    take: opts.limit || 50,
  })
  return trends
}

/**
 * Get trends formatted as context for AI caption/hashtag generation.
 * Returns a string like "Currently trending on TikTok: #dogsoftiktok, #puppylove..."
 */
export async function getTrendsContext(niche: string): Promise<string> {
  const trends = await getTrends({ niche, limit: 30 })
  if (trends.length === 0) return ''

  const byPlatform: Record<string, any[]> = {}
  for (const t of trends) {
    if (!byPlatform[t.platform]) byPlatform[t.platform] = []
    byPlatform[t.platform].push(t)
  }

  const lines: string[] = []
  for (const [platform, items] of Object.entries(byPlatform)) {
    const hashtags = items.filter(t => t.type === 'hashtag').map(t => `#${t.content}`).slice(0, 8)
    const formats = items.filter(t => t.type === 'format').map(t => t.content).slice(0, 3)
    const topics = items.filter(t => t.type === 'topic').map(t => t.content).slice(0, 3)
    const parts: string[] = []
    if (hashtags.length) parts.push(`hashtags: ${hashtags.join(', ')}`)
    if (formats.length) parts.push(`formats: ${formats.join('; ')}`)
    if (topics.length) parts.push(`topics: ${topics.join('; ')}`)
    lines.push(`${platform}: ${parts.join(' | ')}`)
  }
  return `CURRENTLY TRENDING (last 14 days):\n${lines.join('\n')}`
}
