import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'
import { getSecret } from '@/lib/secrets'

let zaiInstance: any = null
async function getZai() {
  if (!zaiInstance) zaiInstance = await ZAI.create()
  return zaiInstance
}

// ---- Transcript fetching per platform ----

async function fetchYouTubeTranscript(videoId: string): Promise<{ title: string; transcript: string; thumbnailUrl: string }> {
  // Use YouTube Data API to get video info + try to get captions
  const apiKey = process.env.YOUTUBE_API_KEY || await getSecret('youtube.api_key')
  let title = ''
  let thumbnailUrl = ''

  if (apiKey) {
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`)
      const data = await res.json()
      const item = data.items?.[0]
      title = item?.snippet?.title || ''
      thumbnailUrl = item?.snippet?.thumbnails?.medium?.url || ''
    } catch {}
  }

  // Fetch transcript via web reader (the page_reader function extracts page content)
  // For YouTube, the transcript is often in the page HTML
  let transcript = ''
  try {
    const zai = await getZai()
    const result: any = await zai.functions.invoke('page_reader', { url: `https://www.youtube.com/watch?v=${videoId}` })
    const html = result?.data?.html || result?.html || ''
    // Try to extract transcript from the page content
    // YouTube transcripts are in the page's ytInitialPlayerResponse
    const transcriptMatch = html.match(/"captions":\{[^}]*"transcript":\{[^}]*"content":\[([^\]]*)\]/)
    if (transcriptMatch) {
      // Extract text segments
      const segments = transcriptMatch[1].match(/"text":"([^"]*)"/g)
      if (segments) {
        transcript = segments.map((s: string) => s.replace(/"text":"|"/g, '')).join(' ')
      }
    }
    // Fallback: use the page title + description as context
    if (!transcript) {
      transcript = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000)
    }
  } catch (err) {
    console.error('Transcript fetch failed:', err)
  }

  return { title, transcript, thumbnailUrl }
}

async function fetchTikTokTranscript(url: string): Promise<{ title: string; transcript: string; thumbnailUrl: string }> {
  try {
    const zai = await getZai()
    const result: any = await zai.functions.invoke('page_reader', { url })
    const html = result?.data?.html || result?.html || ''
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    // TikTok pages have the video description and sometimes captions
    return {
      title: text.slice(0, 100),
      transcript: text.slice(0, 5000),
      thumbnailUrl: '',
    }
  } catch {
    return { title: '', transcript: '', thumbnailUrl: '' }
  }
}

async function fetchInstagramTranscript(url: string): Promise<{ title: string; transcript: string; thumbnailUrl: string }> {
  try {
    const zai = await getZai()
    const result: any = await zai.functions.invoke('page_reader', { url })
    const html = result?.data?.html || result?.html || ''
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return {
      title: text.slice(0, 100),
      transcript: text.slice(0, 5000),
      thumbnailUrl: '',
    }
  } catch {
    return { title: '', transcript: '', thumbnailUrl: '' }
  }
}

function extractVideoId(url: string): { platform: string; videoId: string } | null {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return { platform: 'youtube', videoId: ytMatch[1] }

  // TikTok
  if (url.includes('tiktok.com')) return { platform: 'tiktok', videoId: url }

  // Instagram
  if (url.includes('instagram.com')) return { platform: 'instagram', videoId: url }

  return null
}

// ---- AI analysis: break down the script ----

export interface ScriptBreakdown {
  hookText: string
  patternInterrupt: string
  bodyText: string
  ctaText: string
  psychologyTriggers: string[]
  framework: { name: string; steps: string[] }
  viralScore: number
  analysisNotes: string
  adaptedScript?: string
}

export async function analyzeScript(
  url: string,
  opts: { niche?: string; adaptForNiche?: boolean } = {},
): Promise<{ analysis: ScriptBreakdown; title: string; thumbnailUrl: string; transcript: string }> {
  const zai = await getZai()

  // 1. Extract video ID + platform
  const extracted = extractVideoId(url)
  if (!extracted) throw new Error('Could not identify platform from URL. Supported: YouTube, TikTok, Instagram.')

  // 2. Fetch transcript
  let title = ''
  let transcript = ''
  let thumbnailUrl = ''

  if (extracted.platform === 'youtube') {
    const result = await fetchYouTubeTranscript(extracted.videoId)
    title = result.title
    transcript = result.transcript
    thumbnailUrl = result.thumbnailUrl
  } else if (extracted.platform === 'tiktok') {
    const result = await fetchTikTokTranscript(url)
    title = result.title
    transcript = result.transcript
    thumbnailUrl = result.thumbnailUrl
  } else if (extracted.platform === 'instagram') {
    const result = await fetchInstagramTranscript(url)
    title = result.title
    transcript = result.transcript
    thumbnailUrl = result.thumbnailUrl
  }

  if (!transcript) {
    throw new Error('Could not extract transcript from this video. YouTube videos work best.')
  }

  // 3. Get niche + handle for adaptation
  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const handleSetting = await db.setting.findUnique({ where: { id: 'brand.handle' } })
  const niche = opts.niche || nicheSetting?.value || 'pet content'
  const handle = handleSetting?.value || '@yourhandle'

  // 4. AI analysis prompt
  const prompt = `You are a viral video script analyst. Analyze this video transcript and break it down into its component parts.

Video URL: ${url}
Platform: ${extracted.platform}
Title: ${title}
Transcript: ${transcript.slice(0, 4000)}

Break down the script into these sections:
1. HOOK (0-3 seconds) — the exact opening text that grabs attention
2. PATTERN INTERRUPT — what breaks the viewer's scroll expectation
3. BODY — the main content/message
4. CTA (Call to Action) — what the video asks the viewer to do

Then identify the PSYCHOLOGY TRIGGERS used. Common triggers:
- urgency ("limited time", "act now")
- scarcity ("only 3 left", "selling fast")
- social_proof ("everyone's buying", "trending")
- curiosity ("you won't believe", "wait for it")
- fomo ("don't miss out")
- authority ("experts say", "studies show")
- reciprocity ("free gift", "bonus")
- loss_aversion ("stop wasting", "don't lose")

Then extract the FRAMEWORK — the reusable structure. Common frameworks:
- Problem → Agitation → Solution → Proof → CTA
- Hook → Story → Lesson → CTA
- Before → After → Bridge → CTA
- Question → Answer → Evidence → CTA

Score the video's viral potential (0-100) based on hook strength, psychology, and structure.

${opts.adaptForNiche ? `Finally, ADAPT this script for the ${niche} niche. Keep the psychology and structure, but swap the content to fit ${niche}. Brand handle: ${handle}.` : ''}

Return ONLY a JSON object:
{
  "hookText": "exact opening words",
  "patternInterrupt": "what breaks the scroll",
  "bodyText": "main content summary",
  "ctaText": "call to action text",
  "psychologyTriggers": ["urgency", "social_proof"],
  "framework": { "name": "Problem-Agitation-Solution-Proof-CTA", "steps": ["Hook", "Agitation", "Solution", "Proof", "CTA"] },
  "viralScore": 85,
  "analysisNotes": "why this video works",
  "adaptedScript": "${opts.adaptForNiche ? 'full adapted script for the niche' : ''}"
}`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON, no extra text.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1500,
  })

  const content = result.choices?.[0]?.message?.content || ''
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI analysis failed to produce valid output.')

  let analysis: ScriptBreakdown
  try {
    analysis = JSON.parse(match[0])
  } catch {
    throw new Error('Failed to parse AI analysis.')
  }

  // 5. Save to database
  const saved = await db.analyzedScript.create({
    data: {
      url,
      platform: extracted.platform,
      title,
      thumbnailUrl,
      hookText: analysis.hookText,
      patternInterrupt: analysis.patternInterrupt,
      bodyText: analysis.bodyText,
      ctaText: analysis.ctaText,
      fullScript: transcript.slice(0, 10000),
      psychologyTriggers: JSON.stringify(analysis.psychologyTriggers || []),
      framework: JSON.stringify(analysis.framework || {}),
      viralScore: analysis.viralScore || 50,
      analysisNotes: analysis.analysisNotes,
      adaptedScript: analysis.adaptedScript,
      sourceType: 'single',
    },
  })

  return { analysis, title, thumbnailUrl, transcript }
}

// ---- Bulk analysis ----

export async function bulkAnalyze(urls: string[], opts: { niche?: string; adaptForNiche?: boolean } = {}): Promise<{ analyzed: number; results: any[] }> {
  const results: any[] = []
  let analyzed = 0

  for (const url of urls) {
    try {
      const { analysis, title } = await analyzeScript(url, opts)
      results.push({
        url,
        title,
        viralScore: analysis.viralScore,
        psychologyTriggers: analysis.psychologyTriggers,
        framework: analysis.framework?.name,
        success: true,
      })
      analyzed++
    } catch (err: any) {
      results.push({ url, error: err?.message, success: false })
    }
  }

  // Sort by viral score (highest first), errors at the end
  results.sort((a, b) => {
    if (!a.success) return 1
    if (!b.success) return -1
    return (b.viralScore || 0) - (a.viralScore || 0)
  })

  return { analyzed, results }
}

// ---- Framework library ----

export async function saveFramework(analysisId: string): Promise<void> {
  const script = await db.analyzedScript.findUnique({ where: { id: analysisId } })
  if (!script) throw new Error('Analysis not found')

  const framework = script.framework ? JSON.parse(script.framework) : null
  const triggers = script.psychologyTriggers ? JSON.parse(script.psychologyTriggers) : []

  if (!framework) throw new Error('No framework in this analysis')

  await db.framework.create({
    data: {
      name: framework.name || 'Unnamed Framework',
      description: script.analysisNotes || `Extracted from ${script.platform} video`,
      steps: JSON.stringify(framework.steps || []),
      psychologyTriggers: JSON.stringify(triggers),
      exampleScript: script.adaptedScript || script.fullScript,
      sourceUrl: script.url,
      niche: (await db.setting.findUnique({ where: { id: 'content.niche' } }))?.value || null,
    },
  })
}

export async function getFrameworks(): Promise<any[]> {
  const frameworks = await db.framework.findMany({ orderBy: { useCount: 'desc' } })
  return frameworks.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    steps: f.steps ? JSON.parse(f.steps) : [],
    psychologyTriggers: f.psychologyTriggers ? JSON.parse(f.psychologyTriggers) : [],
    exampleScript: f.exampleScript,
    sourceUrl: f.sourceUrl,
    niche: f.niche,
    useCount: f.useCount,
    createdAt: f.createdAt,
  }))
}

// ---- Adaptation engine ----

export async function adaptScriptForNiche(analysisId: string, niche: string, brandHandle: string): Promise<string> {
  const script = await db.analyzedScript.findUnique({ where: { id: analysisId } })
  if (!script) throw new Error('Analysis not found')

  const zai = await getZai()

  const prompt = `You are a viral script adapter. Take this analyzed viral video and adapt it for a different niche.

Original video:
- Platform: ${script.platform}
- Hook: ${script.hookText}
- Pattern Interrupt: ${script.patternInterrupt}
- Body: ${script.bodyText}
- CTA: ${script.ctaText}
- Psychology triggers: ${script.psychologyTriggers}
- Framework: ${script.framework}

Target niche: ${niche}
Brand handle: ${brandHandle}

Adapt the script by:
1. Keeping the EXACT same framework structure (hook, pattern interrupt, body, CTA)
2. Keeping the same psychology triggers
3. Swapping the content to fit the ${niche} niche
4. Making it sound natural, not forced
5. Including the brand handle ${brandHandle} in the CTA

Return ONLY the adapted script as plain text (not JSON). Format it as:

HOOK: [adapted hook]
PATTERN INTERRUPT: [adapted interrupt]
BODY: [adapted body]
CTA: [adapted CTA]`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a viral script adapter. Output the adapted script in plain text.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    max_tokens: 800,
  })

  const adaptedScript = result.choices?.[0]?.message?.content || ''

  await db.analyzedScript.update({
    where: { id: analysisId },
    data: { adaptedScript },
  })

  return adaptedScript
}
