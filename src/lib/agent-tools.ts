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
  // ---- NEW: Ideation tools ----
  {
    name: 'generate_ideas',
    description: 'Generate fresh content ideas based on current trends, insights, and the user\'s analytics. Use when the user asks "what should I make?" or wants content suggestions.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of ideas to generate (default 5, max 10)' },
      },
    },
    handler: async (args) => {
      const { generateIdeas } = await import('@/lib/ideation')
      const result = await generateIdeas({ count: Math.min(args.count || 5, 10) })
      return {
        generated: result.generated,
        ideas: result.ideas.map(i => ({
          id: i.id,
          title: i.title,
          concept: i.concept,
          scriptOutline: i.scriptOutline,
          format: i.format,
          predictedViralScore: i.predictedViralScore,
          source: i.source,
        })),
      }
    },
  },
  {
    name: 'list_ideas',
    description: 'List saved content ideas. Use to show the user their idea backlog.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status: new, used, rejected' },
      },
    },
    handler: async (args) => {
      const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
      const niche = nicheSetting?.value || 'pet content'
      const where: any = { niche }
      if (args.status) where.status = args.status
      const ideas = await db.idea.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 })
      return {
        count: ideas.length,
        ideas: ideas.map(i => ({
          id: i.id,
          title: i.title,
          concept: i.concept,
          format: i.format,
          predictedViralScore: i.predictedViralScore,
          source: i.source,
          status: i.status,
          createdAt: i.createdAt.toISOString(),
        })),
      }
    },
  },
  {
    name: 'get_insights',
    description: 'Get performance insights from the learning loop — patterns, opportunities, underperformers, and recommendations based on the user\'s actual analytics.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
      const niche = nicheSetting?.value || 'pet content'
      const insights = await db.insight.findMany({
        where: { niche },
        orderBy: [{ confidence: 'desc' }, { freshness: 'desc' }],
        take: 10,
      })
      return {
        count: insights.length,
        insights: insights.map(i => ({
          type: i.type,
          content: i.content,
          confidence: i.confidence,
          data: i.data ? JSON.parse(i.data) : null,
          freshness: i.freshness.toISOString(),
        })),
      }
    },
  },
  {
    name: 'refresh_insights',
    description: 'Re-analyze the user\'s analytics and generate fresh insights. Use when the user asks "why did my video underperform?" or wants performance analysis.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const { refreshInsights } = await import('@/lib/insights')
      const result = await refreshInsights()
      return { ok: true, ...result, message: `Generated ${result.generated} insights` }
    },
  },
  {
    name: 'generate_thumbnail',
    description: 'Generate an AI thumbnail image for a video. Uses built-in AI image generation (no API key needed).',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'The video to generate a thumbnail for' },
        title: { type: 'string', description: 'The video title (used as inspiration)' },
      },
      required: ['title'],
    },
    handler: async (args) => {
      const { generateThumbnail } = await import('@/lib/generate')
      const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
      const niche = nicheSetting?.value || 'pet content'
      const asset = await db.generatedAsset.create({
        data: {
          type: 'thumbnail',
          prompt: args.title,
          modelUsed: 'zai-image',
          status: 'generating',
          videoId: args.videoId,
        },
      })
      try {
        const buffer = await generateThumbnail(args.title, niche)
        const { promises: fs } = await import('fs')
        const path = await import('path')
        const { getDirs, ensureDirs } = await import('@/lib/storage')
        await ensureDirs()
        const filepath = path.join(getDirs().assets, `thumb_${asset.id}.png`)
        await fs.writeFile(filepath, buffer)
        const updated = await db.generatedAsset.update({
          where: { id: asset.id },
          data: { status: 'ready', filePath: filepath, publicUrl: `/api/generate/assets/${asset.id}` },
        })
        return { ok: true, assetId: asset.id, url: `/api/generate/assets/${asset.id}` }
      } catch (err: any) {
        await db.generatedAsset.update({ where: { id: asset.id }, data: { status: 'failed', errorMessage: err?.message } })
        return { error: err?.message || 'Thumbnail generation failed' }
      }
    },
  },
  {
    name: 'generate_broll',
    description: 'Generate AI B-roll video from a text prompt using Replicate (requires Replicate API token). Returns immediately; check back for the video. Use for cinematic shots you didn\'t film.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the video to generate, e.g. "cinematic shot of a golden retriever running on a beach at sunset"' },
      },
      required: ['prompt'],
    },
    handler: async (args) => {
      const { isReplicateConfigured } = await import('@/lib/generate')
      const configured = await isReplicateConfigured()
      if (!configured) {
        return { error: 'Replicate API token not set. Ask the user to add it in Settings → API Keys.' }
      }
      const asset = await db.generatedAsset.create({
        data: { type: 'broll', prompt: args.prompt, modelUsed: 'stable-video-diffusion', status: 'generating' },
      })
      // Don't await — return immediately, generation continues in background
      // (The /api/generate endpoint handles the actual generation with after())
      return {
        ok: true,
        assetId: asset.id,
        message: 'Video generation started. This takes 2-5 minutes. Check the Generate tab or ask me to check status later.',
      }
    },
  },
  {
    name: 'list_generated_assets',
    description: 'List AI-generated assets (thumbnails, B-roll, images) and their status.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by type: thumbnail, broll, image' },
      },
    },
    handler: async (args) => {
      const where: any = {}
      if (args.type) where.type = args.type
      const assets = await db.generatedAsset.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 })
      return {
        count: assets.length,
        assets: assets.map(a => ({
          id: a.id,
          type: a.type,
          prompt: a.prompt,
          status: a.status,
          modelUsed: a.modelUsed,
          url: a.publicUrl ? `/api/generate/assets/${a.id}` : null,
          errorMessage: a.errorMessage,
          createdAt: a.createdAt.toISOString(),
        })),
      }
    },
  },
  // ---- NEW: Repurposing tools ----
  {
    name: 'repurpose_video',
    description: 'Cut a long video into multiple short clips (30-90 seconds) for TikTok/Reels/Shorts. AI identifies the most engaging moments. Use when the user has a long video and wants short clips.',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'The ID of the long video to repurpose' },
        clipCount: { type: 'number', description: 'Number of clips to extract (default 5, max 10)' },
      },
      required: ['videoId'],
    },
    handler: async (args) => {
      const v = await db.video.findUnique({ where: { id: args.videoId } })
      if (!v) return { error: 'Video not found' }
      if (!v.processedPath) return { error: 'Video not processed yet' }
      if (!v.transcription) return { error: 'Video has no transcription — process it first' }
      if (v.durationSec && v.durationSec < 90) {
        return { error: `Video is only ${Math.floor(v.durationSec)}s long — repurposing works best on videos over 90s` }
      }
      // Trigger in background — don't await
      const { repurposeVideo } = await import('@/lib/repurpose')
      repurposeVideo(args.videoId, { clipCount: Math.min(args.clipCount || 5, 10), autoProcess: true })
        .catch((err: any) => console.error('Repurpose failed:', err))
      return {
        ok: true,
        message: `Repurposing started — extracting up to ${args.clipCount || 5} clips. They will appear in the Library as they are processed.`,
      }
    },
  },
  {
    name: 'list_clips',
    description: 'List clips that were extracted from a parent video via repurposing.',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'The parent video ID' },
      },
      required: ['videoId'],
    },
    handler: async (args) => {
      const clips = await db.video.findMany({
        where: { parentId: args.videoId },
        orderBy: { clipStart: 'asc' },
      })
      return {
        count: clips.length,
        clips: clips.map(c => ({
          id: c.id,
          title: c.aiTitle || c.filename,
          status: c.status,
          viralScore: c.viralScore,
          start: c.clipStart,
          end: c.clipEnd,
          duration: c.clipEnd && c.clipStart ? c.clipEnd - c.clipStart : null,
        })),
      }
    },
  },
  // ---- NEW: Brand Kit tools ----
  {
    name: 'get_brand_kit',
    description: 'Get the user\'s brand kit — logo, colors, fonts, watermark settings. Use to understand their visual identity.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const { getBrandKit } = await import('@/lib/brandkit')
      const kit = await getBrandKit()
      return kit || { message: 'No brand kit configured yet' }
    },
  },
  {
    name: 'update_brand_kit',
    description: 'Update the user\'s brand kit settings (colors, fonts, watermark position). Logo must be uploaded via the UI.',
    parameters: {
      type: 'object',
      properties: {
        brandName: { type: 'string' },
        primaryColor: { type: 'string', description: 'Hex color like #FF6B35' },
        secondaryColor: { type: 'string' },
        accentColor: { type: 'string' },
        fontFamily: { type: 'string' },
        watermarkPosition: { type: 'string', description: 'top-left, top-right, bottom-left, bottom-right, center' },
      },
    },
    handler: async (args) => {
      const { saveBrandKit } = await import('@/lib/brandkit')
      const kit = await saveBrandKit(args)
      return { ok: true, brandKit: kit }
    },
  },
  // ---- NEW: Translation tool ----
  {
    name: 'translate_captions',
    description: 'Translate a video\'s caption to multiple languages. Use when the user wants to reach international audiences.',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        languages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Language codes: es, fr, de, it, pt, nl, ru, ja, ko, zh, ar, hi',
        },
      },
      required: ['videoId', 'languages'],
    },
    handler: async (args) => {
      const v = await db.video.findUnique({ where: { id: args.videoId } })
      if (!v) return { error: 'Video not found' }
      const { translateCaptions } = await import('@/lib/ai')
      const text = [v.aiCaption, v.aiDescription, v.aiTitle].filter(Boolean).join('\n\n')
      if (!text) return { error: 'No caption to translate' }
      const translations = await translateCaptions(text, args.languages)
      const existing = v.translations ? JSON.parse(v.translations) : {}
      const merged = { ...existing, ...translations }
      await db.video.update({ where: { id: args.videoId }, data: { translations: JSON.stringify(merged) } })
      return {
        ok: true,
        translated: Object.keys(translations).length,
        languages: Object.keys(translations),
      }
    },
  },
  // ---- NEW: Comment reply tools ----
  {
    name: 'fetch_comments',
    description: 'Fetch new comments from all published posts and generate AI replies. Use when the user asks about comments or wants to reply to their audience.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const { fetchAndProcessComments } = await import('@/lib/comments')
      const result = await fetchAndProcessComments()
      return { ok: true, ...result, message: `Fetched ${result.fetched} comments, suggested ${result.suggested} replies, auto-replied ${result.replied}` }
    },
  },
  {
    name: 'list_comments',
    description: 'List comments with their AI-suggested replies. Filter by status: pending, replied, ignored.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: pending, replied, ignored, all' },
      },
    },
    handler: async (args) => {
      const where: any = {}
      if (args.status && args.status !== 'all') where.replyStatus = args.status
      const comments = await db.comment.findMany({
        where,
        include: { post: { include: { video: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      return {
        count: comments.length,
        comments: comments.map(c => ({
          id: c.id,
          platform: c.platform,
          author: c.authorName,
          text: c.text,
          replyStatus: c.replyStatus,
          replyText: c.replyText,
          videoTitle: c.post?.video?.aiTitle || c.post?.title,
        })),
      }
    },
  },
  {
    name: 'approve_comment_reply',
    description: 'Approve and post an AI-suggested reply to a comment. Optionally provide custom reply text.',
    parameters: {
      type: 'object',
      properties: {
        commentId: { type: 'string' },
        customReply: { type: 'string', description: 'Optional custom reply text (otherwise uses the AI suggestion)' },
      },
      required: ['commentId'],
    },
    handler: async (args) => {
      const { approveAndPostReply } = await import('@/lib/comments')
      try {
        await approveAndPostReply(args.commentId, args.customReply)
        return { ok: true, message: 'Reply posted successfully' }
      } catch (err: any) {
        return { error: err?.message || 'Failed to post reply' }
      }
    },
  },
  {
    name: 'get_voice_profile',
    description: 'Get the user\'s voice profile — persona, tone, signature phrases, auto-reply settings.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const { getVoiceProfile } = await import('@/lib/comments')
      const vp = await getVoiceProfile()
      return vp || { message: 'No voice profile configured yet' }
    },
  },
  {
    name: 'update_voice_profile',
    description: 'Update the user\'s voice profile. This affects how AI generates replies and scripts.',
    parameters: {
      type: 'object',
      properties: {
        persona: { type: 'string', description: 'e.g. "friendly dog mom who loves puns"' },
        tone: { type: 'string', description: 'e.g. "warm, witty, enthusiastic"' },
        signaturePhrases: { type: 'string', description: 'comma-separated phrases to use' },
        autoReplyMode: { type: 'string', description: 'suggest (manual approval) or auto (auto-reply)' },
      },
    },
    handler: async (args) => {
      const { saveVoiceProfile } = await import('@/lib/comments')
      const vp = await saveVoiceProfile(args)
      return { ok: true, voiceProfile: vp }
    },
  },
  // ---- NEW: Hook A/B testing tools ----
  {
    name: 'generate_hooks',
    description: 'Generate 5 hook variants (opening text overlays) for a video. Each is a different style: question, bold claim, curiosity, stat, story. Use when the user wants to test different openings.',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
      },
      required: ['videoId'],
    },
    handler: async (args) => {
      const { generateHookVariants } = await import('@/lib/hooks')
      const result = await generateHookVariants(args.videoId)
      return {
        ok: true,
        count: result.hooks.length,
        hooks: result.hooks,
      }
    },
  },
  {
    name: 'get_hook_insights',
    description: 'Get insights on which hook styles perform best for this user based on past performance data.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const { getHookInsights } = await import('@/lib/hooks')
      const result = await getHookInsights()
      return result
    },
  },
  // ---- NEW: Competitor monitoring tools ----
  {
    name: 'add_competitor',
    description: 'Add a competitor to monitor. AI will alert you when their posts go viral.',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'youtube, tiktok, instagram, x' },
        handle: { type: 'string', description: 'competitor handle without @' },
      },
      required: ['platform', 'handle'],
    },
    handler: async (args) => {
      const competitor = await db.competitor.upsert({
        where: { platform_handle: { platform: args.platform, handle: args.handle.replace('@', '') } },
        create: { platform: args.platform, handle: args.handle.replace('@', ''), active: true },
        update: { active: true },
      })
      return { ok: true, competitor, message: `Now monitoring @${args.handle} on ${args.platform}` }
    },
  },
  {
    name: 'list_competitors',
    description: 'List all tracked competitors.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const competitors = await db.competitor.findMany({ include: { posts: { take: 1 } } })
      return {
        count: competitors.length,
        competitors: competitors.map(c => ({
          id: c.id,
          platform: c.platform,
          handle: c.handle,
          active: c.active,
          lastChecked: c.lastChecked,
        })),
      }
    },
  },
  {
    name: 'get_competitor_alerts',
    description: 'Get viral alerts from monitored competitors — posts that scored 70+ on our viral scale, with AI suggestions on how to create your own version.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const { getCompetitorAlerts } = await import('@/lib/competitors')
      const alerts = await getCompetitorAlerts()
      return { count: alerts.length, alerts }
    },
  },
  {
    name: 'refresh_competitors',
    description: 'Check all monitored competitors for new viral posts. Use when the user asks "what are my competitors up to?"',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const { refreshCompetitors } = await import('@/lib/competitors')
      const result = await refreshCompetitors()
      return { ok: true, ...result, message: `Checked ${result.checked} competitors, found ${result.newPosts} new posts, ${result.alerts} viral alerts` }
    },
  },
  // ---- Script Analyzer tools ----
  {
    name: 'analyze_video_url',
    description: 'Analyze any viral video URL — reverse-engineer the script (hook, pattern interrupt, body, CTA), psychology triggers, and framework. Works with YouTube, TikTok, Instagram URLs.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The video URL to analyze' },
        adaptForNiche: { type: 'boolean', description: 'If true, also generate an adapted version for the user\'s niche' },
      },
      required: ['url'],
    },
    handler: async (args) => {
      const { analyzeScript } = await import('@/lib/script-analysis')
      try {
        const result = await analyzeScript(args.url, { adaptForNiche: args.adaptForNiche })
        return {
          ok: true,
          title: result.title,
          viralScore: result.analysis.viralScore,
          hook: result.analysis.hookText,
          psychologyTriggers: result.analysis.psychologyTriggers,
          framework: result.analysis.framework?.name,
          adaptedScript: result.analysis.adaptedScript ? result.analysis.adaptedScript.slice(0, 500) + '...' : null,
        }
      } catch (err: any) {
        return { error: err?.message || 'Analysis failed' }
      }
    },
  },
  {
    name: 'bulk_analyze_videos',
    description: 'Analyze multiple viral video URLs at once (up to 20). Returns results sorted by viral score.',
    parameters: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of video URLs (max 20)',
        },
      },
      required: ['urls'],
    },
    handler: async (args) => {
      const { bulkAnalyze } = await import('@/lib/script-analysis')
      try {
        const result = await bulkAnalyze(args.urls.slice(0, 20))
        return {
          ok: true,
          analyzed: result.analyzed,
          topResults: result.results.slice(0, 5).map((r: any) => ({
            url: r.url,
            title: r.title,
            viralScore: r.viralScore,
            framework: r.framework,
          })),
        }
      } catch (err: any) {
        return { error: err?.message || 'Bulk analysis failed' }
      }
    },
  },
  {
    name: 'list_analyzed_scripts',
    description: 'List previously analyzed viral video scripts.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const scripts = await db.analyzedScript.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
      return {
        count: scripts.length,
        scripts: scripts.map(s => ({
          id: s.id,
          url: s.url,
          platform: s.platform,
          title: s.title,
          viralScore: s.viralScore,
          framework: s.framework ? JSON.parse(s.framework)?.name : null,
        })),
      }
    },
  },
  {
    name: 'list_frameworks',
    description: 'List saved reusable framework templates extracted from viral videos.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const frameworks = await db.framework.findMany({ orderBy: { useCount: 'desc' }, take: 10 })
      return {
        count: frameworks.length,
        frameworks: frameworks.map(f => ({
          id: f.id,
          name: f.name,
          steps: f.steps ? JSON.parse(f.steps) : [],
          useCount: f.useCount,
        })),
      }
    },
  },
  {
    name: 'adapt_script_for_niche',
    description: 'Take a previously analyzed viral video and adapt its script for the user\'s niche.',
    parameters: {
      type: 'object',
      properties: {
        analysisId: { type: 'string', description: 'The ID of the analyzed script to adapt' },
      },
      required: ['analysisId'],
    },
    handler: async (args) => {
      const { adaptScriptForNiche } = await import('@/lib/script-analysis')
      const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
      const handleSetting = await db.setting.findUnique({ where: { id: 'brand.handle' } })
      try {
        const adapted = await adaptScriptForNiche(args.analysisId, nicheSetting?.value || 'pet content', handleSetting?.value || '@yourhandle')
        return { ok: true, adaptedScript: adapted.slice(0, 800) }
      } catch (err: any) {
        return { error: err?.message || 'Adaptation failed' }
      }
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
