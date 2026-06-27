import { db } from '@/lib/db'
import { getZai } from '@/lib/ai'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getDirs, ensureDirs } from '@/lib/storage'
import { processVideoPipeline } from '@/lib/pipeline'

export interface ClipSuggestion {
  start: number      // seconds
  end: number        // seconds
  title: string
  reason: string
  transcriptExcerpt: string
  predictedScore: number
}

/**
 * Analyze a long video's transcript and suggest N clip-worthy moments.
 * Uses the LLM to identify hooks, emotional peaks, and standalone segments.
 */
export async function suggestClips(
  videoId: string,
  targetCount: number = 5,
): Promise<{ clips: ClipSuggestion[] }> {
  const video = await db.video.findUnique({ where: { id: videoId } })
  if (!video) throw new Error('Video not found')
  if (!video.transcription) throw new Error('Video has no transcription. Process it first.')
  if (!video.durationSec) throw new Error('Video duration unknown')

  const zai = await getZai()
  const nicheSetting = await db.setting.findUnique({ where: { id: 'content.niche' } })
  const niche = nicheSetting?.value || 'pet content'

  const prompt = `You are a viral short-form video editor. Analyze this ${niche} video transcript and identify the ${targetCount} best moments to cut into short clips (30-90 seconds each) for TikTok/Reels/Shorts.

Video duration: ${Math.floor(video.durationSec!)} seconds
Video title: ${video.aiTitle || video.filename}

Full transcript:
"""
${video.transcription}
"""

For each clip, identify:
1. start time (in seconds) — should be at a natural sentence/sentence boundary
2. end time (in seconds) — 30-90 seconds after start, at a natural ending
3. A scroll-stopping title for the clip (under 80 chars)
4. Why this moment works as a standalone clip (hook strength, emotional peak, etc.)
5. The transcript excerpt for this clip
6. Predicted viral score (0-100)

Prioritize:
- Strong hooks in the first 3 seconds of the clip
- Self-contained moments that make sense without context
- Emotional peaks, surprising moments, or valuable insights
- Avoid clips that start mid-sentence or end abruptly

Return ONLY a JSON array:
[{
  "start": 45,
  "end": 95,
  "title": "...",
  "reason": "...",
  "transcriptExcerpt": "...",
  "predictedScore": 85
}]`

  const result = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant. Output valid JSON arrays.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  })

  const content = result.choices?.[0]?.message?.content || ''
  const match = content.match(/\[[\s\S]*\]/)
  if (!match) return { clips: [] }

  try {
    const clips: ClipSuggestion[] = JSON.parse(match[0])
    // Validate and clamp times
    return {
      clips: clips
        .filter(c => typeof c.start === 'number' && typeof c.end === 'number')
        .map(c => ({
          start: Math.max(0, c.start),
          end: Math.min(video.durationSec!, c.end),
          title: c.title || `Clip ${c.start}-${c.end}`,
          reason: c.reason || '',
          transcriptExcerpt: c.transcriptExcerpt || '',
          predictedScore: c.predictedScore || 50,
        }))
        .slice(0, targetCount),
    }
  } catch {
    return { clips: [] }
  }
}

/**
 * Extract a clip from a video using FFmpeg.
 * Cuts from start to end, re-encodes for clean output.
 */
export async function extractClip(
  sourcePath: string,
  outputPath: string,
  startSec: number,
  endSec: number,
): Promise<void> {
  await ensureDirs()
  const duration = endSec - startSec
  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', [
      '-y',
      '-ss', startSec.toString(),
      '-i', sourcePath,
      '-t', duration.toString(),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ], { maxBuffer: 1024 * 1024 * 50 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve()
    })
  })
}

/**
 * Full repurposing pipeline:
 * 1. Suggest clips via AI
 * 2. Extract each clip with FFmpeg
 * 3. Create new Video records for each clip
 * 4. Fire off the processing pipeline for each clip (captions, scoring, multi-format)
 */
export async function repurposeVideo(
  videoId: string,
  opts: { clipCount?: number; autoProcess?: boolean } = {},
): Promise<{ clipsCreated: number; clips: any[] }> {
  const video = await db.video.findUnique({ where: { id: videoId } })
  if (!video) throw new Error('Video not found')
  if (!video.processedPath) throw new Error('Video not processed yet')
  if (!video.transcription) throw new Error('Video has no transcription')

  const clipCount = opts.clipCount || 5
  const autoProcess = opts.autoProcess !== false

  // 1. Suggest clips
  const { clips: suggestions } = await suggestClips(videoId, clipCount)
  if (suggestions.length === 0) {
    return { clipsCreated: 0, clips: [] }
  }

  // 2. Extract each clip + create Video records
  const { originals } = getDirs()
  const createdClips: any[] = []

  for (const suggestion of suggestions) {
    const clipId = randomUUID()
    const clipFilename = `${path.basename(video.filename, path.extname(video.filename))}_clip_${clipId}.mp4`
    const clipPath = path.join(originals, clipFilename)

    try {
      await extractClip(video.processedPath, clipPath, suggestion.start, suggestion.end)

      // Create Video record for the clip
      const clip = await db.video.create({
        data: {
          filename: clipFilename,
          originalPath: clipPath,
          sizeBytes: (await fs.stat(clipPath)).size,
          mimeType: 'video/mp4',
          durationSec: suggestion.end - suggestion.start,
          status: 'pending',
          aiTitle: suggestion.title,
          editSettings: JSON.stringify({
            burnCaptions: true,
            watermarkPosition: 'bottom-right',
            watermarkOpacity: 0.7,
            watermarkScale: 0.15,
            musicVolume: 0.2,
            originalVolume: 1.0,
            autoTrimSilence: false,
          }),
          parentId: videoId,
          isClip: true,
          clipStart: suggestion.start,
          clipEnd: suggestion.end,
        },
      })

      createdClips.push({
        id: clip.id,
        title: suggestion.title,
        start: suggestion.start,
        end: suggestion.end,
        reason: suggestion.reason,
        predictedScore: suggestion.predictedScore,
      })

      // 3. Fire off processing pipeline for this clip
      if (autoProcess) {
        const settings = {
          burnCaptions: true,
          watermarkPosition: 'bottom-right' as const,
          watermarkOpacity: 0.7,
          watermarkScale: 0.15,
          musicVolume: 0.2,
          originalVolume: 1.0,
          autoTrimSilence: false,
        }
        // Don't await — run in background
        processVideoPipeline(clip.id, settings).catch(err => {
          console.error(`Clip processing failed for ${clip.id}:`, err)
        })
      }
    } catch (err) {
      console.error(`Failed to extract clip ${suggestion.start}-${suggestion.end}:`, err)
    }
  }

  return { clipsCreated: createdClips.length, clips: createdClips }
}
