import ZAI from 'z-ai-web-dev-sdk'
import { promises as fs } from 'fs'
import { SrtCue } from './ffmpeg'
import { getTrendsContext } from './trends'

let zaiInstance: any = null

async function getZai() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// Available TTS voices
export const AVAILABLE_VOICES = [
  { id: 'tongtong', name: 'Tongtong (Warm, friendly)', gender: 'neutral' },
  { id: 'female-tianmei', name: 'Tianmei (Female, cheerful)', gender: 'female' },
  { id: 'male-yunlong', name: 'Yunlong (Male, deep)', gender: 'male' },
  { id: 'female-shaonv', name: 'Shaonv (Female, young)', gender: 'female' },
  { id: 'male-yunhao', name: 'Yunhao (Male, energetic)', gender: 'male' },
  { id: 'female-yujia', name: 'Yujia (Female, calm)', gender: 'female' },
  { id: 'male-siling', name: 'Siling (Male, authoritative)', gender: 'male' },
]

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

export async function analyzeVideoContent(transcript: string, opts: { niche?: string; brandHandle?: string; trendsContext?: string } = {}): Promise<VideoAnalysis> {
  const zai = await getZai()
  const niche = opts.niche || 'dog / pet content'
  const handle = opts.brandHandle || '@yourhandle'
  const trendsBlock = opts.trendsContext ? `\n\n${opts.trendsContext}\n` : ''

  const prompt = `You are a viral short-form video strategist specialized in ${niche}.

Transcript of the video:
"""
${transcript || '(no speech detected — likely a visual/atmospheric clip)'}
"""

Brand handle: ${handle}
${trendsBlock}
Produce a JSON object (NO markdown, NO commentary, ONLY valid JSON) with this exact shape:
{
  "title": "a scroll-stopping title under 80 chars, optimized for ${niche}",
  "description": "a 2-3 sentence YouTube/TikTok description",
  "caption": "an Instagram/Facebook caption with emojis, max 220 chars, ending with the handle",
  "hashtags": ["array", "of", "8-12", "relevant", "hashtags", "without", "the", "hash", "symbol", "PRIORITIZE currently trending ones if available above"],
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

// ---- Voiceover generation ----
export interface VoiceoverScript {
  text: string
  tone: string
  estimatedDuration: number
}

export async function generateVoiceoverScript(
  transcript: string,
  opts: { niche?: string; brandHandle?: string; videoDescription?: string; tone?: string } = {},
): Promise<VoiceoverScript> {
  const zai = await getZai()
  const niche = opts.niche || 'pet content'
  const handle = opts.brandHandle || '@yourhandle'
  const tone = opts.tone || 'funny, energetic, engaging'

  const prompt = `You are a viral video scriptwriter specialized in ${niche}.
Write a short voiceover script (under 30 seconds when read aloud, ~60-80 words) for a video.

Original transcript (if any):
"""
${transcript || '(no speech)'}
"""

${opts.videoDescription ? `Video description: ${opts.videoDescription}\n` : ''}
Tone: ${tone}
Brand handle: ${handle}

The script should:
- Hook in the first 3 seconds
- Be conversational and fun (NOT a corporate ad)
- Reference the brand handle at the end if natural
- Avoid generic phrases like "in this video we will..."
- Sound like a real person talking to their audience

Return ONLY a JSON object:
{
  "text": "the voiceover script as a single string",
  "tone": "the tone you used (one phrase)",
  "estimatedDuration": 20
}`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON, no extra text.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
  })
  const content = result.choices?.[0]?.message?.content || ''
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) {
    return {
      text: `Hey friends! Check this out. If you love this content, follow ${handle} for more!`,
      tone,
      estimatedDuration: 15,
    }
  }
  try {
    return JSON.parse(match[0])
  } catch {
    return {
      text: `Hey friends! Check this out. If you love this content, follow ${handle} for more!`,
      tone,
      estimatedDuration: 15,
    }
  }
}

export async function generateTTS(text: string, voice: string = 'tongtong', speed: number = 1.0): Promise<Buffer> {
  const zai = await getZai()
  const response: any = await zai.audio.tts.create({
    input: text,
    voice,
    speed,
    response_format: 'mp3',
    stream: false,
  })
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(new Uint8Array(arrayBuffer))
}
