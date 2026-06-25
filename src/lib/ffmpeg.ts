import { execFile, execFileSync } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  codec: string
  fps: number
  bitrate: number
}

function parseFps(rate: string | undefined): number {
  if (!rate) return 0
  const m = rate.match(/^(\d+)\/(\d+)$/)
  if (!m) return parseFloat(rate) || 0
  const num = parseInt(m[1])
  const den = parseInt(m[2])
  return den === 0 ? 0 : num / den
}

// Check if a video file has an audio stream
export async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const result = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      filePath,
    ], { encoding: 'utf-8' })
    return result.trim().includes('audio')
  } catch {
    return false
  }
}

export async function probeVideo(inputPath: string): Promise<VideoMetadata> {
  const result = execFileSync('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ], { encoding: 'utf-8' })
  const data = JSON.parse(result)
  const vStream = (data.streams || []).find((s: any) => s.codec_type === 'video')
  return {
    duration: parseFloat(data.format?.duration || '0'),
    width: vStream ? parseInt(vStream.width) : 0,
    height: vStream ? parseInt(vStream.height) : 0,
    codec: vStream?.codec_name || 'unknown',
    fps: vStream ? parseFps(vStream.r_frame_rate) : 0,
    bitrate: parseInt(data.format?.bit_rate || '0'),
  }
}

export async function extractThumbnail(inputPath: string, outPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-ss', '00:00:01',
      '-frames:v', '1',
      '-vf', 'scale=640:-1',
      '-q:v', '3',
      outPath,
    ], (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function extractAudio(inputPath: string, outPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-b:a', '32k',
      outPath,
    ], (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export interface SrtCue {
  start: number
  end: number
  text: string
}

export function srtFromCues(cues: SrtCue[]): string {
  return cues.map((c, i) => {
    const fmt = (sec: number) => {
      const h = Math.floor(sec / 3600)
      const m = Math.floor((sec % 3600) / 60)
      const s = Math.floor(sec % 60)
      const ms = Math.floor((sec - Math.floor(sec)) * 1000)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
    }
    return `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`
  }).join('\n')
}

export function assFromCues(cues: SrtCue[], opts: { fontSize?: number; primaryColor?: string; outlineColor?: string } = {}): string {
  const fontSize = opts.fontSize || 48
  const primary = opts.primaryColor || '&H00FFFFFF'
  const outline = opts.outlineColor || '&H00000000'
  const fmt = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    const cs = Math.floor((sec - Math.floor(sec)) * 100)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }
  const dialogue = cues.map(c => {
    return `Dialogue: 0,${fmt(c.start)},${fmt(c.end)},Caption,,0,0,0,,${c.text.replace(/\n/g, '\\N')}`
  }).join('\n')
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,${fontSize},${primary},&H000000FF,${outline},&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogue}
`
}

export interface EditOptions {
  captions: SrtCue[]
  burnCaptions: boolean
  watermarkPath?: string
  watermarkOpacity?: number
  watermarkPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  watermarkScale?: number
  musicPath?: string
  musicVolume?: number
  originalVolume?: number
  introPath?: string
  outroPath?: string
  autoTrimSilence?: boolean
  outputWidth?: number
  outputHeight?: number
  outputFps?: number
  // Voiceover
  voiceoverPath?: string
  voiceoverVolume?: number       // 0-1, default 1.0
  voiceoverReplaceOriginal?: boolean // if true, voiceover replaces original audio
}

export async function processVideo(
  inputPath: string,
  outputPath: string,
  opts: EditOptions,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const parts: string[] = []
  const filters: string[] = []

  // Build input list
  let inputIdx = 0
  parts.push('-i', inputPath)
  const mainIdx = inputIdx++
  let musicIdx = -1
  let introIdx = -1
  let outroIdx = -1
  let voiceoverIdx = -1
  let silentAudioIdx = -1

  // Check if the main video has an audio stream — if not, add a silent audio source
  // (needed because FFmpeg filtergraph will try to reference [mainIdx:a])
  const hasAudio = await hasAudioStream(inputPath)
  if (!hasAudio) {
    parts.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100')
    silentAudioIdx = inputIdx++
  }

  if (opts.musicPath) {
    parts.push('-i', opts.musicPath)
    musicIdx = inputIdx++
  }
  if (opts.introPath) {
    parts.push('-i', opts.introPath)
    introIdx = inputIdx++
  }
  if (opts.outroPath) {
    parts.push('-i', opts.outroPath)
    outroIdx = inputIdx++
  }
  if (opts.voiceoverPath) {
    parts.push('-i', opts.voiceoverPath)
    voiceoverIdx = inputIdx++
  }

  // Build filter complex
  const chains: string[] = []

  // Caption burn-in via ASS subtitles
  if (opts.burnCaptions && opts.captions.length > 0) {
    const assFile = outputPath + '.ass'
    await fs.writeFile(assFile, assFromCues(opts.captions), 'utf-8')
    chains.push(`[${mainIdx}:v]subtitles='${assFile.replace(/'/g, "\\'")}'[vmain]`)
  } else {
    chains.push(`[${mainIdx}:v]null[vmain]`)
  }

  // Watermark overlay
  if (opts.watermarkPath) {
    const pos = opts.watermarkPosition || 'bottom-right'
    const scale = opts.watermarkScale || 0.15
    const opacity = opts.watermarkOpacity ?? 0.7
    const posMap: Record<string, string> = {
      'top-left': '10:10',
      'top-right': 'main_w-overlay_w-10:10',
      'bottom-left': '10:main_h-overlay_h-10',
      'bottom-right': 'main_w-overlay_w-10:main_h-overlay_h-10',
      'center': '(main_w-overlay_w)/2:(main_h-overlay_h)/2',
    }
    const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0')
    const inIdx = musicIdx >= 0 ? -1 : (introIdx >= 0 ? -1 : (outroIdx >= 0 ? -1 : -1))
    // We'll generate the watermark as a separate input — but for simplicity use movie filter
    const wmChain = `movie='${opts.watermarkPath.replace(/'/g, "\\'")}',scale=iw*${scale}:-1,format=rgba,colorchannelmixer=aa=${opacity}[wm]`
    chains.push(wmChain)
    chains.push(`[vmain][wm]overlay=${posMap[pos]}[vmain]`)
  }

  // Audio mixing — combine original (or silent), music, and voiceover
  const audioChains: string[] = []
  const audioLabels: string[] = []
  const origVol = opts.originalVolume ?? 1.0
  // If the video has no audio, use the silent audio source instead
  const audioSourceIdx = hasAudio ? mainIdx : silentAudioIdx

  // Original audio (unless voiceover is replacing it)
  if (!opts.voiceoverReplaceOriginal) {
    audioChains.push(`[${audioSourceIdx}:a]volume=${origVol}[aorig]`)
    audioLabels.push('[aorig]')
  }

  // Background music
  if (opts.musicPath) {
    const musicVol = opts.musicVolume ?? 0.25
    audioChains.push(`[${musicIdx}:a]volume=${musicVol},aloop=loop=-1:size=2e9[amusic]`)
    audioLabels.push('[amusic]')
  }

  // Voiceover
  if (opts.voiceoverPath && voiceoverIdx >= 0) {
    const voVol = opts.voiceoverVolume ?? 1.0
    audioChains.push(`[${voiceoverIdx}:a]volume=${voVol}[avo]`)
    audioLabels.push('[avo]')
  }

  let finalAudioLabel = 'aout'
  if (audioLabels.length === 0) {
    // No audio sources at all — use the silent source directly
    chains.push(`[${audioSourceIdx}:a]anull[aout]`)
  } else if (audioLabels.length === 1) {
    // Single source — just rename the output label to [aout]
    // The chain looks like: [N:a]volume=X[xyz] — we need to replace [xyz] with [aout]
    const chain = audioChains[0]
    const renamed = chain.replace(/\[[a-z]+\]$/, '[aout]')
    chains.push(renamed)
  } else {
    // Multiple sources — mix them
    chains.push(...audioChains)
    chains.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=0[aout]`)
  }

  // Concat intro/outro if provided
  let finalVideoLabel = 'vmain'
  // finalAudioLabel already set above to 'aout'
  if (opts.introPath || opts.outroPath) {
    const concatParts: string[] = []
    if (opts.introPath) {
      chains.push(`[${introIdx}:v]setpts=PTS-STARTPTS[vintro]`)
      chains.push(`[${introIdx}:a]asetpts=PTS-STARTPTS[aintro]`)
      concatParts.push('[vintro][aintro]')
    }
    concatParts.push(`[${finalVideoLabel}][${finalAudioLabel}]`)
    if (opts.outroPath) {
      chains.push(`[${outroIdx}:v]setpts=PTS-STARTPTS[voutro]`)
      chains.push(`[${outroIdx}:a]asetpts=PTS-STARTPTS[aoutro]`)
      concatParts.push('[voutro][aoutro]')
    }
    const finalLabel = 'vconcat'
    chains.push(`${concatParts.join('')}concat=n=${concatParts.length}:v=1:a=1[${finalLabel}][aconcat]`)
    finalVideoLabel = finalLabel
    finalAudioLabel = 'aconcat'
  }

  const filterComplex = chains.join(';')

  parts.push('-filter_complex', filterComplex)
  parts.push('-map', `[${finalVideoLabel}]`)
  parts.push('-map', `[${finalAudioLabel}]`)
  parts.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23')
  parts.push('-c:a', 'aac', '-b:a', '128k')
  parts.push('-pix_fmt', 'yuv420p')
  parts.push('-movflags', '+faststart')
  parts.push('-y', outputPath)

  await new Promise<void>((resolve, reject) => {
    const proc = execFile('ffmpeg', parts, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message))
      } else {
        resolve()
      }
    })
    // Optionally track progress via stderr parsing
    if (onProgress && proc.stderr) {
      let lastPct = 0
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString()
        const m = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
        if (m) {
          const cur = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
          // We don't have duration here easily — caller can manage
        }
      })
    }
  })
}

// Auto-trim silence using silencedetect
export async function detectSilence(inputPath: string, threshold = -30, minDuration = 0.5): Promise<{ start: number; end: number }[]> {
  const out = execFileSync('ffmpeg', [
    '-i', inputPath, '-af', `silencedetect=noise=${threshold}dB:d=${minDuration}`,
    '-f', 'null', '-'
  ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
  // Capture stderr - silencedetect writes to stderr
  const lines = out.split('\n').filter(l => l.includes('silence_'))
  const starts: number[] = []
  const ends: number[] = []
  for (const l of lines) {
    const sm = l.match(/silence_start: ([\d.]+)/)
    if (sm) starts.push(parseFloat(sm[1]))
    const em = l.match(/silence_end: ([\d.]+)/)
    if (em) ends.push(parseFloat(em[1]))
  }
  return starts.map((s, i) => ({ start: s, end: ends[i] || s }))
}

// ---- Multi-format conversion ----
// Generates a crop+scale of the source to the target aspect ratio.
// Strategy: scale to fill, then center-crop the overflow. Adds padding only if source aspect
// can't be cleanly cropped (rare).
export type AspectRatio = '16:9' | '9:16' | '1:1'

export function aspectToDims(ratio: AspectRatio): { w: number; h: number } {
  switch (ratio) {
    case '16:9': return { w: 1920, h: 1080 }
    case '9:16': return { w: 1080, h: 1920 }
    case '1:1':  return { w: 1080, h: 1080 }
  }
}

export async function convertToAspectRatio(
  inputPath: string,
  outputPath: string,
  ratio: AspectRatio,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { w, h } = aspectToDims(ratio)
  // scale + crop filter: scale to cover target dimensions, then crop center
  // 'scale=w:h:force_original_aspect_ratio=increase,crop=w:h'
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
  await new Promise<void>((resolve, reject) => {
    const proc = execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ], { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve()
    })
    if (onProgress && proc.stderr) {
      proc.stderr.on('data', () => {
        // ffmpeg progress is in stderr; without total duration we can't compute pct here
        // Caller can wrap this if needed
      })
    }
  })
}

export async function generateFormatThumbnail(inputPath: string, outPath: string, ratio: AspectRatio): Promise<void> {
  const { w, h } = aspectToDims(ratio)
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-ss', '00:00:01',
      '-frames:v', '1',
      '-vf', vf,
      '-q:v', '3',
      outPath,
    ], (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

// ---- Image-to-Video conversion ----
// Turns a static image into a video with a Ken Burns effect (slow zoom/pan).
// This makes photo content feel dynamic for social media.

export async function convertImageToVideo(
  imagePath: string,
  outputPath: string,
  durationSec: number = 15,
  opts: { zoom?: number; fps?: number; width?: number; height?: number } = {},
): Promise<void> {
  const zoom = opts.zoom ?? 1.1  // subtle zoom from 1.0x to 1.1x over the duration
  const fps = opts.fps || 30
  const width = opts.width || 1280
  const height = opts.height || 720

  // Ken Burns effect: slow zoom in from center
  // zoompan filter: d = duration in frames, s = output size, z = zoom expression
  const totalFrames = durationSec * fps
  const vf = `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='min(zoom+0.0015,${zoom})':d=${totalFrames}:s=${width}x${height}:fps=${fps},format=yuv420p`

  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', [
      '-y',
      '-loop', '1',
      '-i', imagePath,
      '-t', durationSec.toString(),
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ], { maxBuffer: 1024 * 1024 * 50 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve()
    })
  })
}

// Create a slideshow from multiple images with crossfade transitions.
// Each image shows for `perImageSec` seconds, with `transitionSec` crossfade between them.
export async function createSlideshow(
  imagePaths: string[],
  outputPath: string,
  opts: { perImageSec?: number; transitionSec?: number; fps?: number; width?: number; height?: number } = {},
): Promise<void> {
  const perImageSec = opts.perImageSec || 5
  const transitionSec = opts.transitionSec || 0.7
  const fps = opts.fps || 30
  const width = opts.width || 1280
  const height = opts.height || 720

  if (imagePaths.length === 0) throw new Error('No images provided')
  if (imagePaths.length === 1) {
    // Single image — just use convertImageToVideo
    return convertImageToVideo(imagePaths[0], outputPath, perImageSec * 3, { fps, width, height })
  }

  // Build a filter complex that:
  // 1. Loops each image for perImageSec
  // 2. Applies Ken Burns zoom to each
  // 3. Crossfades them together
  const inputs: string[] = []
  for (const p of imagePaths) {
    inputs.push('-loop', '1', '-t', perImageSec.toString(), '-i', p)
  }

  const chains: string[] = []
  const totalFramesPerImage = perImageSec * fps
  const transitionFrames = transitionSec * fps

  // Create a zoompan + scale chain for each image
  for (let i = 0; i < imagePaths.length; i++) {
    chains.push(
      `[${i}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='min(zoom+0.001,1.1)':d=${totalFramesPerImage}:s=${width}x${height}:fps=${fps},format=yuv420p,setsar=1[v${i}]`
    )
  }

  // Crossfade: xfade requires sequential chaining
  // [v0][v1]xfade=transition=fade:duration=0.7:offset=4.3[v01]
  // [v01][v2]xfade=transition=fade:duration=0.7:offset=8.6[v012]
  // etc.
  let prevLabel = 'v0'
  for (let i = 1; i < imagePaths.length; i++) {
    const offset = (perImageSec * i) - (transitionSec * i)
    const outLabel = i === imagePaths.length - 1 ? 'vout' : `v${i}_acc`
    const transition = i % 3 === 0 ? 'slideleft' : i % 3 === 1 ? 'fade' : 'dissolve'
    chains.push(
      `[${prevLabel}][v${i}]xfade=transition=${transition}:duration=${transitionSec}:offset=${offset}[${outLabel}]`
    )
    prevLabel = outLabel
  }

  const filterComplex = chains.join(';')
  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', `[${prevLabel}]`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ]

  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 1024 * 1024 * 50 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve()
    })
  })
}
