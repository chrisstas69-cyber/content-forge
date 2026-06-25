import { db } from '@/lib/db'
import { platforms } from '@/lib/social'
import { getTrends } from '@/lib/trends'
import { getAnalyticsSummary } from '@/lib/analytics'
import { getSecret } from '@/lib/secrets'

// All the tools the AI agent can call.
// Each tool takes a JSON object of args and returns a JSON-serializable result.

export interface AgentTool {
  name: string
  description: string
  parameters: any  // JSON Schema
  handler: (args: any) => Promise<any>
}

export const agentTools: AgentTool[] = [
  {
    name: 'list_videos',
    description: 'List all videos in the library with their status, viral score, and AI-generated title. Use this to see what content the user has.',
    parameters: { type: 'object', properties: { status: { type: 'string', description: 'Filter by status: pending, editing, ready, published, failed' } } },
    handler: async (args) => {
      const where: any = {}
      if (args.status) where.status = args.status
      const videos = await db.video.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, filename: true, aiTitle: true, status: true, viralScore: true, aiHashtags: true, durationSec: true, createdAt: true },
      })
      return {
        count: videos.length,
        videos: videos.map(v => ({
          id: v.id,
          filename: v.filename,
          title: v.aiTitle || v.filename,
          status: v.status,
          viralScore: v.viralScore,
          hashtags: v.aiHashtags ? JSON.parse(v.aiHashtags) : [],
          duration: v.durationSec ? `${Math.floor(v.durationSec)}s` : null,
          created: v.createdAt.toISOString(),
        })),
      }
    },
  },
  {
    name: 'get_video_details',
    description: 'Get full details about a specific video including transcript, AI caption, hashtags, viral score, and processing status.',
    parameters: { type: 'object', properties: { videoId: { type: 'string' } }, required: ['videoId'] },
    handler: async (args) => {
      const v = await db.video.findUnique({ where: { id: args.videoId }, include: { posts: true } })
      if (!v) return { error: 'Video not found' }
      return {
        id: v.id,
        filename: v.filename,
        title: v.aiTitle || v.filename,
        description: v.aiDescription,
        caption: v.aiCaption,
        hashtags: v.aiHashtags ? JSON.parse(v.aiHashtags) : [],
        viralScore: v.viralScore,
        status: v.status,
        progress: v.progress,
        currentStep: v.currentStep,
        errorMessage: v.errorMessage,
        transcription: v.transcription?.slice(0, 1000),
        voiceoverText: v.voiceoverText,
        voiceoverEnabled: v.voiceoverEnabled,
        formats: v.processedFormats ? Object.keys(JSON.parse(v.processedFormats)) : [],
        duration: v.durationSec,
        sizeMb: (v.sizeBytes / 1024 / 1024).toFixed(2),
        posts: v.posts.map(p => ({ platform: p.platform, status: p.status, scheduledAt: p.scheduledAt, publishedAt: p.publishedAt, platformUrl: p.platformUrl })),
        createdAt: v.createdAt.toISOString(),
      }
    },
  },
  {
    name: 'list_scheduled_posts',
    description: 'List all scheduled and recently published/failed posts.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const posts = await db.post.findMany({
        where: {
          OR: [
            { status: 'scheduled' },
            { status: 'uploading' },
            { status: 'pending' },
            { status: 'published', publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            { status: 'failed', updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
        include: { video: true, account: true },
        orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }],
        take: 50,
      })
      return {
        count: posts.length,
        posts: posts.map(p => ({
          id: p.id,
          videoTitle: p.video?.aiTitle || p.video?.filename,
          platform: p.platform,
          accountHandle: p.account?.handle,
          status: p.status,
          title: p.title,
          scheduledAt: p.scheduledAt,
          publishedAt: p.publishedAt,
          platformUrl: p.platformUrl,
          errorMessage: p.errorMessage,
        })),
      }
    },
  },
  {
    name: 'cancel_scheduled_post',
    description: 'Cancel a scheduled post. Only works on posts with status "scheduled".',
    parameters: { type: 'object', properties: { postId: { type: 'string' } }, required: ['postId'] },
    handler: async (args) => {
      const post = await db.post.findUnique({ where: { id: args.postId } })
      if (!post) return { error: 'Post not found' }
      if (post.status !== 'scheduled') return { error: `Cannot cancel post with status ${post.status}` }
      await db.post.delete({ where: { id: args.postId } })
      return { ok: true, message: 'Scheduled post cancelled' }
    },
  },
  {
    name: 'get_connected_accounts',
    description: 'List all connected social media accounts with their platform, handle, and connection status.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const accounts = await db.socialAccount.findMany({ include: { posts: true } })
      const platformStatus: Record<string, boolean> = {}
      for (const key of Object.keys(platforms)) {
        platformStatus[key] = await platforms[key].isConfigured()
      }
      return {
        accounts: accounts.map(a => ({
          id: a.id,
          platform: a.platform,
          handle: a.handle,
          displayName: a.displayName,
          connected: a.connected,
          postCount: a.posts.length,
        })),
        platformConfigured: platformStatus,
      }
    },
  },
  {
    name: 'get_settings',
    description: 'Get current app settings: brand handle, content niche, default voiceover voice.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const settings = await db.setting.findMany()
      const map: Record<string, string> = {}
      for (const s of settings) map[s.id] = s.value
      return {
        brandHandle: map['brand.handle'] || '@yourhandle',
        contentNiche: map['content.niche'] || 'pet content',
      }
    },
  },
  {
    name: 'update_settings',
    description: 'Update app settings. Pass the fields you want to change.',
    parameters: {
      type: 'object',
      properties: {
        brandHandle: { type: 'string', description: 'The brand handle, e.g. @mydog' },
        contentNiche: { type: 'string', description: 'The content niche, e.g. "dog / pet content" or "fitness"' },
      },
    },
    handler: async (args) => {
      const updates: { id: string; value: string }[] = []
      if (args.brandHandle) updates.push({ id: 'brand.handle', value: args.brandHandle })
      if (args.contentNiche) updates.push({ id: 'content.niche', value: args.contentNiche })
      for (const u of updates) {
        await db.setting.upsert({
          where: { id: u.id },
          create: { id: u.id, value: u.value },
          update: { value: u.value },
        })
      }
      return { ok: true, updated: updates.length, fields: updates.map(u => u.id) }
    },
  },
  {
    name: 'search_trends',
    description: 'Search for trending hashtags, sounds, formats, and topics in the user\'s niche. Returns trends scraped from the web (refreshed daily).',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Filter by platform: tiktok, instagram, youtube, x' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
    handler: async (args) => {
      const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
      const niche = nicheSetting?.value || 'pet content'
      const trends = await getTrends({ niche, platform: args.platform, limit: args.limit || 20 })
      return {
        niche,
        count: trends.length,
        trends: trends.map(t => ({
          platform: t.platform,
          type: t.type,
          content: t.content,
          summary: t.summary,
          score: t.score,
          freshness: t.freshness.toISOString(),
        })),
      }
    },
  },
  {
    name: 'refresh_trends',
    description: 'Trigger a fresh web search for trending content in the user\'s niche. This takes 30-60 seconds. Use when the user asks "what\'s trending now" or trends seem stale.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
      const niche = nicheSetting?.value || 'pet content'
      // Use dynamic import to avoid circular dependency
      const { refreshTrends } = await import('@/lib/trends')
      const result = await refreshTrends(niche, ['tiktok', 'instagram', 'youtube', 'x'])
      return { ok: true, niche, ...result, message: `Found ${result.discovered} trends, saved ${result.saved} new ones` }
    },
  },
  {
    name: 'get_analytics',
    description: 'Get analytics summary across all published posts: total views, likes, comments, shares, per-platform breakdown, and top-performing videos.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const summary = await getAnalyticsSummary()
      return summary
    },
  },
  {
    name: 'get_dashboard_stats',
    description: 'Get high-level dashboard stats: total videos, processing, ready, scheduled, published, failed, avg viral score.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const [total, ready, published, failed, processing, scheduled] = await Promise.all([
        db.video.count(),
        db.video.count({ where: { status: 'ready' } }),
        db.video.count({ where: { status: 'published' } }),
        db.video.count({ where: { status: 'failed' } }),
        db.video.count({ where: { status: { in: ['pending', 'editing', 'transcribing', 'scoring'] } } }),
        db.post.count({ where: { status: 'scheduled' } }),
      ])
      const all = await db.video.findMany({ where: { viralScore: { not: null } }, select: { viralScore: true } })
      const avgScore = all.length > 0 ? Math.round(all.reduce((a, v) => a + (v.viralScore || 0), 0) / all.length) : 0
      return { total, ready, published, failed, processing, scheduled, avgViralScore: avgScore }
    },
  },
]

export function getToolByName(name: string): AgentTool | undefined {
  return agentTools.find(t => t.name === name)
}

// OpenAI/ZAI-compatible function specs for the LLM
export const toolSpecs = agentTools.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}))
