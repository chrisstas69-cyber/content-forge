import ZAI from 'z-ai-web-dev-sdk'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getSecret } from '@/lib/secrets'
import { getDirs, ensureDirs } from '@/lib/storage'

let zaiInstance: any = null
async function getZai() {
  if (!zaiInstance) zaiInstance = await ZAI.create()
  return zaiInstance
}

// ---- ZAI Image Generation (built-in, no API key needed) ----
export async function generateImage(prompt: string, size: string = '1024x1024'): Promise<Buffer> {
  const zai = await getZai()
  const response: any = await zai.images.generations.create({
    prompt,
    size,
  })
  const imageBase64 = response.data?.[0]?.base64
  if (!imageBase64) throw new Error('Image generation returned no data')
  return Buffer.from(imageBase64, 'base64')
}

// ---- Replicate Video Generation ----
// Requires REPLICATE_API_TOKEN secret to be set.
// Uses Stable Video Diffusion by default, or AnimateDiff for text-to-video.

export async function isReplicateConfigured(): Promise<boolean> {
  const token = await getSecret('replicate.api_token')
  return !!token
}

interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output: string | string[]
  error: string | null
  urls: { get: string; cancel: string }
}

async function createReplicatePrediction(model: string, input: any): Promise<ReplicatePrediction> {
  const token = await getSecret('replicate.api_token')
  if (!token) throw new Error('Replicate API token not set. Add it in Settings → API Keys.')

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=10', // wait up to 10 seconds for result
    },
    body: JSON.stringify({ version: model, input }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Replicate API error: ${err}`)
  }
  return await res.json()
}

async function pollReplicatePrediction(predictionUrl: string): Promise<ReplicatePrediction> {
  const token = await getSecret('replicate.api_token')
  if (!token) throw new Error('Replicate API token not set')

  for (let i = 0; i < 60; i++) {  // up to 5 minutes
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(predictionUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data: ReplicatePrediction = await res.json()
    if (data.status === 'succeeded') return data
    if (data.status === 'failed') throw new Error(data.error || 'Generation failed')
  }
  throw new Error('Timed out waiting for Replicate')
}

// Text-to-video using Stable Video Diffusion (image-to-video) or AnimateDiff (text-to-video)
export async function generateVideoFromText(prompt: string, opts: { duration?: number } = {}): Promise<{ url: string; model: string }> {
  // First, generate a starting image with ZAI
  const imageBuffer = await generateImage(prompt, '1024x1024')
  const { assets } = getDirs()
  await ensureDirs()
  const imagePath = path.join(assets, `s2v_${randomUUID()}.png`)
  await fs.writeFile(imagePath, imageBuffer)

  // Upload image to Replicate (they need a URL or data URI)
  // For simplicity, we'll use the data URI approach
  const dataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`

  // Stable Video Diffusion model
  const model = 'stable-video-diffusion:3f127a68c07c6c6d3c5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5'
  // Use a simpler text-to-video model
  const prediction = await createReplicatePrediction(
    'cjwbw/stable-video-diffusion:3f127a68c07c6c6d3c5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5',
    {
      image: dataUri,
      video_length: opts.duration || 14,
      sizing_strategy: 'maintain_aspect_ratio',
      frames_per_second: 7,
    }
  )

  if (prediction.status === 'succeeded') {
    const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
    return { url: output, model: 'stable-video-diffusion' }
  }

  // Poll for completion
  const final = await pollReplicatePrediction(prediction.urls.get)
  const output = Array.isArray(final.output) ? final.output[0] : final.output
  return { url: output, model: 'stable-video-diffusion' }
}

// Generate a thumbnail for a video (text-to-image with overlay-ready composition)
export async function generateThumbnail(videoTitle: string, niche: string, opts: { style?: string } = {}): Promise<Buffer> {
  const style = opts.style || 'bold, eye-catching, high contrast, social media thumbnail style'
  const prompt = `A ${style} social media thumbnail image for a ${niche} video titled "${videoTitle}". 
The image should be visually striking, with space for text overlay. No text in the image itself.
Aspect ratio: 16:9 horizontal.`
  return generateImage(prompt, '1792x1024')
}

// Download a file from URL to local storage
export async function downloadToFile(url: string, filepath: string): Promise<void> {
  await ensureDirs()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(filepath, buffer)
}
