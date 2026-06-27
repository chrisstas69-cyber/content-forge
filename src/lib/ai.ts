import ZAI from 'z-ai-web-dev-sdk'
import { promises as fs } from 'fs'
import { SrtCue } from './ffmpeg'
import { getTrendsContext } from './trends'
import { getSecret } from '@/lib/secrets'
import { db } from '@/lib/db'

let zaiInstance: any = null

export async function getZai() {
  if (!zaiInstance) {
    let rawZai: any = null
    try {
      rawZai = await ZAI.create()
    } catch (err: any) {
      console.warn('Sandbox ZAI SDK failed to initialize:', err.message)
    }

    zaiInstance = {
      audio: rawZai ? rawZai.audio : {
        speech: {
          create: async () => {
            throw new Error('Audio generation is unavailable: Sandbox ZAI SDK is not configured in this environment.')
          }
        }
      },
      chat: {
        completions: {
          create: async (params: { messages: any[]; temperature?: number }) => {
            const openrouterKey = await getSecret('openrouter.api_key')
            const openaiKey = await getSecret('openai.api_key')
            const geminiKey = await getSecret('gemini.api_key')
            
            // Get LLM configurations from database settings
            const activeProviderRow = await db.setting.findUnique({ where: { id: 'llm.provider' } })
            const activeProvider = activeProviderRow?.value || 'zai'
            
            const openrouterModelRow = await db.setting.findUnique({ where: { id: 'llm.openrouter.model' } })
            const openrouterModel = openrouterModelRow?.value || 'meta-llama/llama-3.1-8b-instruct:free'

            const openaiModelRow = await db.setting.findUnique({ where: { id: 'llm.openai.model' } })
            const openaiModel = openaiModelRow?.value || 'gpt-4o-mini'

            const geminiModelRow = await db.setting.findUnique({ where: { id: 'llm.gemini.model' } })
            const geminiModel = geminiModelRow?.value || 'gemini-1.5-flash'
            
            const messages = params.messages
            const temperature = params.temperature ?? 0.7
            
            // Resolve task-specific model overrides
            const promptText = messages.map(m => m.content).join('\n').toLowerCase()
            let overrideModel = ''
            
            if (promptText.includes('scriptwriter') || promptText.includes('voiceover script')) {
              overrideModel = (await db.setting.findUnique({ where: { id: 'llm.model.scripts' } }))?.value || ''
            } else if (promptText.includes('viralscore') || promptText.includes('viral reasons') || promptText.includes('video strategist')) {
              overrideModel = (await db.setting.findUnique({ where: { id: 'llm.model.analysis' } }))?.value || ''
            } else if (promptText.includes('content ideas') || promptText.includes('content idea') || promptText.includes('scriptoutline') || promptText.includes('ideas/concepts')) {
              overrideModel = (await db.setting.findUnique({ where: { id: 'llm.model.ideation' } }))?.value || ''
            }

            // Decide which provider to use
            let selectedProvider = 'zai'
            if (activeProvider === 'openrouter' && openrouterKey) {
              selectedProvider = 'openrouter'
            } else if (activeProvider === 'openai' && openaiKey) {
              selectedProvider = 'openai'
            } else if (activeProvider === 'gemini' && geminiKey) {
              selectedProvider = 'gemini'
            } else if (openrouterKey) {
              selectedProvider = 'openrouter'
            } else if (openaiKey) {
              selectedProvider = 'openai'
            } else if (geminiKey) {
              selectedProvider = 'gemini'
            }

            // 1. OpenRouter
            if (selectedProvider === 'openrouter') {
              try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openrouterKey}`,
                    'HTTP-Referer': 'https://contentforge.app',
                    'X-Title': 'ContentForge'
                  },
                  body: JSON.stringify({
                    model: overrideModel || openrouterModel,
                    messages,
                    temperature
                  })
                })
                if (res.ok) {
                  const data = await res.json()
                  const content = data.choices?.[0]?.message?.content
                  if (content) {
                    return {
                      choices: [{ message: { content } }]
                    }
                  }
                }
                console.error('OpenRouter completion failed:', await res.text())
              } catch (err) {
                console.error('OpenRouter fetch error:', err)
              }
            }
            
            // 2. OpenAI
            if (selectedProvider === 'openai') {
              try {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiKey}`
                  },
                  body: JSON.stringify({
                    model: overrideModel || openaiModel,
                    messages,
                    temperature
                  })
                })
                if (res.ok) {
                  const data = await res.json()
                  const content = data.choices?.[0]?.message?.content
                  if (content) {
                    return {
                      choices: [{ message: { content } }]
                    }
                  }
                }
                console.error('OpenAI completion failed:', await res.text())
              } catch (err) {
                console.error('OpenAI fetch error:', err)
              }
            }
            
            // 3. Gemini
            if (selectedProvider === 'gemini') {
              try {
                const targetModel = overrideModel || geminiModel
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${geminiKey}`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    contents: messages.map(m => {
                      let role = 'user'
                      if (m.role === 'assistant' || m.role === 'model') {
                        role = 'model'
                      }
                      return {
                        role,
                        parts: [{ text: m.content }]
                      }
                    }),
                    generationConfig: {
                      temperature
                    }
                  })
                })
                if (res.ok) {
                  const data = await res.json()
                  const content = data.candidates?.[0]?.content?.parts?.[0]?.text
                  if (content) {
                    return {
                      choices: [{ message: { content } }]
                    }
                  }
                }
                console.error('Gemini completion failed:', await res.text())
              } catch (err) {
                console.error('Gemini fetch error:', err)
              }
            }
            
            // Fallback to default ZAI SDK completions
            if (rawZai) {
              return rawZai.chat.completions.create(params)
            }
            throw new Error('AI Completions failed: No valid API key is configured (OpenRouter, OpenAI, or Gemini) and Sandbox ZAI SDK is not initialized.')
          }
        }
      }
    }
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
    response_format: 'wav',
    stream: false,
  })
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(new Uint8Array(arrayBuffer))
}

// ---- Subtitle translation ----
export const SUPPORTED_LANGUAGES = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
]

export async function translateCaptions(text: string, targetLangs: string[]): Promise<Record<string, string>> {
  const zai = await getZai()
  const results: Record<string, string> = {}

  for (const lang of targetLangs) {
    const langName = SUPPORTED_LANGUAGES.find(l => l.code === lang)?.name || lang
    try {
      const result = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: `You are a professional translator. Translate the user's text to ${langName}. Preserve the meaning, tone, and any emojis. Return ONLY the translation, no commentary.` },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
      })
      const translated = result.choices?.[0]?.message?.content || ''
      if (translated) results[lang] = translated.trim()
    } catch (err) {
      console.error(`Translation to ${lang} failed:`, err)
    }
  }

  return results
}

// ---- Per-platform caption variants ----
export interface PlatformCaptions {
  youtube: { title: string; description: string; hashtags: string[] }
  tiktok: { title: string; description: string; hashtags: string[] }
  instagram: { caption: string; hashtags: string[] }
  facebook: { title: string; description: string }
  x: { text: string }
}

export async function generatePlatformCaptions(
  baseTitle: string,
  baseDescription: string,
  baseHashtags: string[],
  transcript: string,
  opts: { niche?: string; brandHandle?: string } = {},
): Promise<PlatformCaptions> {
  const zai = await getZai()
  const niche = opts.niche || 'pet content'
  const handle = opts.brandHandle || '@yourhandle'

  const prompt = `You are a social media copywriter specializing in ${niche}.
Take this base content and create platform-specific variants optimized for each platform's culture and constraints.

Base title: ${baseTitle}
Base description: ${baseDescription}
Base hashtags: ${baseHashtags.join(', ')}
Transcript excerpt: ${(transcript || '').slice(0, 500)}
Brand handle: ${handle}

Platform guidelines:
- YouTube: SEO-optimized title (under 100 chars), detailed description with timestamps/links, 10-15 hashtags
- TikTok: Punchy title (under 150 chars), casual description with emojis, 4-6 trending hashtags
- Instagram: Engaging caption with emojis and line breaks (under 2200 chars), 15-30 hashtags at the end
- Facebook: Conversational title + description (under 500 chars), minimal hashtags (2-3)
- X: Single tweet under 280 chars including hashtags, punchy and shareable

Return ONLY valid JSON:
{
  "youtube": { "title": "...", "description": "...", "hashtags": ["...", "..."] },
  "tiktok": { "title": "...", "description": "...", "hashtags": ["...", "..."] },
  "instagram": { "caption": "...", "hashtags": ["...", "..."] },
  "facebook": { "title": "...", "description": "..." },
  "x": { "text": "..." }
}`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON, no extra text.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
  })
  const content = result.choices?.[0]?.message?.content || ''
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) {
    // Fallback to base content
    return {
      youtube: { title: baseTitle, description: baseDescription, hashtags: baseHashtags },
      tiktok: { title: baseTitle, description: baseDescription, hashtags: baseHashtags.slice(0, 6) },
      instagram: { caption: `${baseDescription}\n\n${baseHashtags.map(h => `#${h}`).join(' ')}`, hashtags: baseHashtags },
      facebook: { title: baseTitle, description: baseDescription },
      x: { text: `${baseTitle}\n\n${baseHashtags.slice(0, 3).map(h => `#${h}`).join(' ')}`.slice(0, 280) },
    }
  }
  try {
    return JSON.parse(match[0])
  } catch {
    return {
      youtube: { title: baseTitle, description: baseDescription, hashtags: baseHashtags },
      tiktok: { title: baseTitle, description: baseDescription, hashtags: baseHashtags.slice(0, 6) },
      instagram: { caption: `${baseDescription}\n\n${baseHashtags.map(h => `#${h}`).join(' ')}`, hashtags: baseHashtags },
      facebook: { title: baseTitle, description: baseDescription },
      x: { text: `${baseTitle}\n\n${baseHashtags.slice(0, 3).map(h => `#${h}`).join(' ')}`.slice(0, 280) },
    }
  }
}
