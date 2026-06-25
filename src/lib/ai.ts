import ZAI from 'z-ai-web-dev-sdk'
import { promises as fs } from 'fs'
import { SrtCue } from './ffmpeg'

let zaiInstance: any = null

async function getZai() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// Transcribe audio file using ZAI ASR (returns segments)
export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export async function transcribeAudio(audioPath: string): Promise<TranscriptSegment[]> {
  const zai = await getZai()
  const audioBuffer = await fs.readFile(audioPath)
  const file_base64 = audioBuffer.toString('base64')
  const result: any = await zai.audio.asr.create({ file_base64 })
  // The ASR response typically contains text + optionally segments
  const text: string = result?.text || result?.data?.text || result?.transcript || ''
  // If segments are provided use them; otherwise create a single cue
  if (Array.isArray(result?.segments) && result.segments.length > 0) {
    return result.segments.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }))
  }
  if (Array.isArray(result?.data?.segments) && result.data.segments.length > 0) {
    return result.data.segments.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }))
  }
  // Fallback: chunk the text into ~3s cues
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const cues: TranscriptSegment[] = []
  const wordsPerCue = 6
  const secondsPerCue = 2.5
  for (let i = 0; i < words.length; i += wordsPerCue) {
    const chunk = words.slice(i, i + wordsPerCue).join(' ')
    const start = (i / wordsPerCue) * secondsPerCue
    cues.push({ start, end: start + secondsPerCue, text: chunk })
  }
  return cues
}

export interface VideoAnalysis {
  title: string
  description: string
  caption: string
  hashtags: string[]
  viralScore: number
  viralReasons: string[]
  improvements: string[]
}

export async function analyzeVideoContent(transcript: string, opts: { niche?: string; brandHandle?: string } = {}): Promise<VideoAnalysis> {
  const zai = await getZai()
  const niche = opts.niche || 'dog / pet content'
  const handle = opts.brandHandle || '@yourhandle'
  const prompt = `You are a viral short-form video strategist specialized in ${niche}.

Transcript of the video:
"""
${transcript || '(no speech detected — likely a visual/atmospheric clip)'}
"""

Brand handle: ${handle}

Produce a JSON object (NO markdown, NO commentary, ONLY valid JSON) with this exact shape:
{
  "title": "a scroll-stopping title under 80 chars, optimized for ${niche}",
  "description": "a 2-3 sentence YouTube/TikTok description",
  "caption": "an Instagram/Facebook caption with emojis, max 220 chars, ending with the handle",
  "hashtags": ["array", "of", "8-12", "relevant", "hashtags", "without", "the", "hash", "symbol"],
  "viralScore": <integer 0-100 based on hook strength, emotional pull, trend alignment, rewatchability>,
  "viralReasons": ["bullet", "list", "of", "3-5", "reasons", "for", "the", "score"],
  "improvements": ["3-5", "actionable", "improvement", "suggestions"]
}

Return ONLY the JSON.`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON, no extra text.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
  })
  const content = result.choices?.[0]?.message?.content || ''
  // Extract JSON even if wrapped in code fences
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) {
    return {
      title: 'Untitled',
      description: '',
      caption: handle,
      hashtags: [],
      viralScore: 50,
      viralReasons: [],
      improvements: [],
    }
  }
  try {
    return JSON.parse(match[0])
  } catch {
    return {
      title: 'Untitled',
      description: '',
      caption: handle,
      hashtags: [],
      viralScore: 50,
      viralReasons: [],
      improvements: [],
    }
  }
}
