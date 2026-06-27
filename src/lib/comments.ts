import { db } from '@/lib/db'
import { getZai } from '@/lib/ai'
import { platforms } from '@/lib/social'

export interface VoiceProfileData {
  persona?: string
  tone?: string
  signaturePhrases?: string
  avoidPhrases?: string
  autoReplyMode?: string  // suggest | auto
  replyLength?: string    // short | medium | long
}

export async function getVoiceProfile(): Promise<VoiceProfileData | null> {
  const vp = await db.voiceProfile.findUnique({ where: { id: 'default' } })
  if (!vp) return null
  return {
    persona: vp.persona || undefined,
    tone: vp.tone || undefined,
    signaturePhrases: vp.signaturePhrases || undefined,
    avoidPhrases: vp.avoidPhrases || undefined,
    autoReplyMode: vp.autoReplyMode || 'suggest',
    replyLength: vp.replyLength || 'short',
  }
}

export async function saveVoiceProfile(data: VoiceProfileData): Promise<VoiceProfileData> {
  const vp = await db.voiceProfile.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      persona: data.persona || null,
      tone: data.tone || null,
      signaturePhrases: data.signaturePhrases || null,
      avoidPhrases: data.avoidPhrases || null,
      autoReplyMode: data.autoReplyMode || 'suggest',
      replyLength: data.replyLength || 'short',
    },
    update: {
      persona: data.persona || null,
      tone: data.tone || null,
      signaturePhrases: data.signaturePhrases || null,
      avoidPhrases: data.avoidPhrases || null,
      autoReplyMode: data.autoReplyMode || 'suggest',
      replyLength: data.replyLength || 'short',
    },
  })
  return vp as any
}

// ---- Comment fetching per platform ----

interface FetchedComment {
  platformCommentId: string
  authorName: string
  authorHandle?: string
  text: string
}

async function fetchYouTubeComments(account: any, platformPostId: string): Promise<FetchedComment[]> {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${platformPostId}&maxResults=50`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    })
    const data = await res.json()
    return (data.items || []).map((item: any) => ({
      platformCommentId: item.id,
      authorName: item.snippet?.topLevelComment?.snippet?.authorDisplayName || 'Unknown',
      authorHandle: item.snippet?.topLevelComment?.snippet?.authorChannelId?.value,
      text: item.snippet?.topLevelComment?.snippet?.textDisplay || '',
    }))
  } catch { return [] }
}

async function fetchInstagramComments(account: any, platformPostId: string): Promise<FetchedComment[]> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${platformPostId}/comments?fields=from,message,id&access_token=${account.accessToken}`)
    const data = await res.json()
    return (data.data || []).map((c: any) => ({
      platformCommentId: c.id,
      authorName: c.from?.name || 'Unknown',
      authorHandle: c.from?.username,
      text: c.message || '',
    }))
  } catch { return [] }
}

async function fetchFacebookComments(account: any, platformPostId: string): Promise<FetchedComment[]> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${platformPostId}/comments?fields=from,message&access_token=${account.accessToken}`)
    const data = await res.json()
    return (data.data || []).map((c: any) => ({
      platformCommentId: c.id,
      authorName: c.from?.name || 'Unknown',
      authorHandle: c.from?.id,
      text: c.message || '',
    }))
  } catch { return [] }
}

async function fetchXComments(account: any, platformPostId: string): Promise<FetchedComment[]> {
  try {
    const res = await fetch(`https://api.twitter.com/2/tweets/${platformPostId}/quote_tweets?max_results=50`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    })
    const data = await res.json()
    return (data.data || []).map((t: any) => ({
      platformCommentId: t.id,
      authorName: t.author_id || 'Unknown',
      text: t.text || '',
    }))
  } catch { return [] }
}

async function fetchCommentsForPost(post: any): Promise<FetchedComment[]> {
  const account = post.account
  if (!account || !post.platformPostId) return []
  switch (post.platform) {
    case 'youtube': return fetchYouTubeComments(account, post.platformPostId)
    case 'instagram': return fetchInstagramComments(account, post.platformPostId)
    case 'facebook': return fetchFacebookComments(account, post.platformPostId)
    case 'x': return fetchXComments(account, post.platformPostId)
    default: return []
  }
}

// ---- AI reply generation ----

export async function generateReply(commentText: string, videoTitle: string, voiceProfile: VoiceProfileData): Promise<string> {
  const zai = await getZai()
  const lengthGuide = voiceProfile.replyLength === 'short' ? '1 sentence (under 100 chars)' :
                      voiceProfile.replyLength === 'medium' ? '2-3 sentences (under 300 chars)' :
                      '3-5 sentences (under 500 chars)'

  const prompt = `You are replying to a comment on a social media video.
Use the user's voice profile to match their style.

Voice profile:
- Persona: ${voiceProfile.persona || 'a friendly content creator'}
- Tone: ${voiceProfile.tone || 'warm and engaging'}
- Signature phrases to use: ${voiceProfile.signaturePhrases || 'none'}
- Phrases to avoid: ${voiceProfile.avoidPhrases || 'none'}

Video title: "${videoTitle}"
Comment: "${commentText}"

Reply guidelines:
- Be ${lengthGuide}
- Match the voice profile's tone exactly
- Use a signature phrase if it fits naturally
- Don't be overly promotional
- If the comment is a question, answer it
- If it's a compliment, thank them genuinely
- If it's negative, respond with grace
- Don't use hashtags or emojis excessively

Return ONLY the reply text, no quotes or commentary.`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a social media reply generator. Output only the reply text.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    max_tokens: 200,
  })
  return result.choices?.[0]?.message?.content?.trim() || ''
}

// ---- Comment posting per platform ----

async function postYouTubeReply(account: any, commentId: string, replyText: string): Promise<void> {
  await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snippet: {
        parentId: commentId,
        textOriginal: replyText,
      },
    }),
  })
}

async function postInstagramReply(account: any, commentId: string, replyText: string): Promise<void> {
  await fetch(`https://graph.facebook.com/v21.0/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message: replyText, access_token: account.accessToken }),
  })
}

async function postFacebookReply(account: any, commentId: string, replyText: string): Promise<void> {
  await fetch(`https://graph.facebook.com/v21.0/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message: replyText, access_token: account.accessToken }),
  })
}

async function postXReply(account: any, originalTweetId: string, replyText: string): Promise<void> {
  await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: replyText, reply: { in_reply_to_tweet_id: originalTweetId } }),
  })
}

async function postReply(comment: any, replyText: string): Promise<void> {
  const post = await db.post.findUnique({ where: { id: comment.postId }, include: { account: true } })
  if (!post?.account) throw new Error('Account not found')
  switch (comment.platform) {
    case 'youtube': return postYouTubeReply(post.account, comment.platformCommentId, replyText)
    case 'instagram': return postInstagramReply(post.account, comment.platformCommentId, replyText)
    case 'facebook': return postFacebookReply(post.account, comment.platformCommentId, replyText)
    case 'x': return postXReply(post.account, comment.platformCommentId, replyText)
    default: throw new Error(`No reply support for ${comment.platform}`)
  }
}

// ---- Main comment processing pipeline ----

export async function fetchAndProcessComments(): Promise<{ fetched: number; replied: number; suggested: number }> {
  const voiceProfile = await getVoiceProfile() || {}
  // Get all published posts with platformPostId
  const publishedPosts = await db.post.findMany({
    where: { status: 'published', platformPostId: { not: null } },
    include: { account: true, video: true },
    take: 50,
  })

  let fetched = 0
  let replied = 0
  let suggested = 0

  for (const post of publishedPosts) {
    try {
      const comments = await fetchCommentsForPost(post)
      for (const c of comments) {
        // Skip if already exists
        const existing = await db.comment.findUnique({
          where: { postId_platformCommentId: { postId: post.id, platformCommentId: c.platformCommentId } },
        })
        if (existing) continue

        fetched++
        const comment = await db.comment.create({
          data: {
            postId: post.id,
            platformCommentId: c.platformCommentId,
            platform: post.platform,
            authorName: c.authorName,
            authorHandle: c.authorHandle,
            text: c.text,
            replyStatus: 'pending',
          },
        })

        // Generate AI reply
        try {
          const replyText = await generateReply(c.text, post.video?.aiTitle || post.title || '', voiceProfile)

          if (voiceProfile.autoReplyMode === 'auto') {
            // Auto-post the reply
            try {
              await postReply(comment, replyText)
              await db.comment.update({
                where: { id: comment.id },
                data: { replyStatus: 'replied', replyText, repliedAt: new Date() },
              })
              replied++
            } catch (err: any) {
              await db.comment.update({
                where: { id: comment.id },
                data: { replyStatus: 'failed', replyText, replyError: err?.message },
              })
            }
          } else {
            // Suggest mode — save the reply for manual approval
            await db.comment.update({
              where: { id: comment.id },
              data: { replyText, replyStatus: 'pending' },
            })
            suggested++
          }
        } catch (err: any) {
          console.error('Reply generation failed:', err)
        }
      }
    } catch (err) {
      console.error(`Comment fetch failed for post ${post.id}:`, err)
    }
  }

  return { fetched, replied, suggested }
}

export async function approveAndPostReply(commentId: string, customReply?: string): Promise<void> {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    include: { post: { include: { account: true } } },
  })
  if (!comment) throw new Error('Comment not found')
  const replyText = customReply || comment.replyText
  if (!replyText) throw new Error('No reply text available')
  await postReply(comment, replyText)
  await db.comment.update({
    where: { id: commentId },
    data: { replyStatus: 'replied', replyText, repliedAt: new Date() },
  })
}
