import { getZai } from '@/lib/ai'
import { promises as fs } from 'fs'
import { getSecret } from '@/lib/secrets'
import { ensureDirs } from '@/lib/storage'

// ---- Production image generation ----
export async function generateImage(prompt: string, size: string = '1024x1024'): Promise<Buffer> {
  const errors: string[] = []
  const openaiKey = await getSecret('openai.api_key')

  // The ZAI SDK is only available inside its original sandbox. Production runs
  // on Vercel, so use the customer's configured image provider there.
  if (openaiKey) {
    try {
      const openaiSize = size === '1792x1024' ? '1536x1024' : size
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt,
          size: openaiSize,
          output_format: 'png',
        }),
      })
      const body: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `OpenAI returned ${res.status}`)
      const imageBase64 = body.data?.[0]?.b64_json
      if (imageBase64) return Buffer.from(imageBase64, 'base64')
      const imageUrl = body.data?.[0]?.url
      if (imageUrl) {
        const imageRes = await fetch(imageUrl)
        if (!imageRes.ok) throw new Error(`Image download returned ${imageRes.status}`)
        return Buffer.from(await imageRes.arrayBuffer())
      }
      throw new Error('OpenAI returned no image data')
    } catch (err: any) {
      errors.push(`OpenAI: ${err?.message || String(err)}`)
    }
  }

  const geminiKey = await getSecret('gemini.api_key')
  if (geminiKey) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent', {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      })
      const body: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Gemini returned ${res.status}`)
      const parts = body?.candidates?.[0]?.content?.parts || []
      const imagePart = parts.find((part: any) => part.inlineData?.data || part.inline_data?.data)
      const imageBase64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data
      if (!imageBase64) throw new Error('Gemini returned no image data')
      return Buffer.from(imageBase64, 'base64')
    } catch (err: any) {
      errors.push(`Gemini: ${err?.message || String(err)}`)
    }
  }

  const openrouterKey = await getSecret('openrouter.api_key')
  if (openrouterKey) {
    try {
      const aspectRatio = size === '1792x1024' || size === '1536x1024' ? '16:9' : '1:1'
      const res = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://content-forge-sepia.vercel.app',
          'X-Title': 'ContentForge',
        },
        body: JSON.stringify({
          model: 'google/gemini-3.1-flash-image',
          prompt,
          aspect_ratio: aspectRatio,
          output_format: 'png',
        }),
      })
      const body: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `OpenRouter returned ${res.status}`)
      const imageBase64 = body?.data?.[0]?.b64_json
      if (!imageBase64) throw new Error('OpenRouter returned no image data')
      return Buffer.from(imageBase64, 'base64')
    } catch (err: any) {
      errors.push(`OpenRouter: ${err?.message || String(err)}`)
    }
  }

  const replicateToken = await getSecret('replicate.api_token')
  if (replicateToken) {
    try {
      const aspectRatio = size === '1792x1024' || size === '1536x1024' ? '16:9' : '1:1'
      const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${replicateToken}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
        },
        body: JSON.stringify({ input: { prompt, aspect_ratio: aspectRatio, output_format: 'png' } }),
      })
      const prediction: ReplicatePrediction & { detail?: string } = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(prediction.detail || prediction.error || `Replicate returned ${res.status}`)
      const final = prediction.status === 'succeeded'
        ? prediction
        : await pollReplicatePrediction(prediction.urls.get)
      const output = Array.isArray(final.output) ? final.output[0] : final.output
      if (!output) throw new Error('Replicate returned no image URL')
      const imageRes = await fetch(output)
      if (!imageRes.ok) throw new Error(`Image download returned ${imageRes.status}`)
      return Buffer.from(await imageRes.arrayBuffer())
    } catch (err: any) {
      errors.push(`Replicate: ${err?.message || String(err)}`)
    }
  }

  // Keep the sandbox provider as a development fallback when it is present.
  try {
    const zai = await getZai()
    if (zai?.images?.generations?.create) {
      const response: any = await zai.images.generations.create({ prompt, size })
      const imageBase64 = response.data?.[0]?.base64 || response.data?.[0]?.b64_json
      if (imageBase64) return Buffer.from(imageBase64, 'base64')
    }
  } catch (err: any) {
    errors.push(`Sandbox AI: ${err?.message || String(err)}`)
  }

  if (!openaiKey && !geminiKey && !openrouterKey && !replicateToken) {
    throw new Error('AI image generation needs an OpenAI, Gemini, OpenRouter, or Replicate API key. Add one in Settings → API Keys.')
  }
  throw new Error(`AI image generation failed. ${errors.join(' | ')}`)
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

async function createOfficialReplicatePrediction(model: string, input: any): Promise<ReplicatePrediction> {
  const token = await getSecret('replicate.api_token')
  if (!token) throw new Error('Replicate API token not set. Add it in Settings → API Keys.')
  const [owner, name] = model.split('/')
  if (!owner || !name) throw new Error(`Invalid Replicate model: ${model}`)
  const res = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({ input }),
  })
  const prediction: ReplicatePrediction & { detail?: string } = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(prediction.detail || prediction.error || `Replicate returned ${res.status}`)
  return prediction
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
  const duration = Math.min(12, Math.max(2, opts.duration || 5))
  const prediction = await createOfficialReplicatePrediction('bytedance/seedance-1-pro', {
    prompt,
    duration,
    resolution: '480p',
    aspect_ratio: '16:9',
    fps: 24,
    camera_fixed: false,
  })

  if (prediction.status === 'succeeded') {
    const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
    return { url: output, model: 'seedance-1-pro' }
  }

  // Poll for completion
  const final = await pollReplicatePrediction(prediction.urls.get)
  const output = Array.isArray(final.output) ? final.output[0] : final.output
  return { url: output, model: 'seedance-1-pro' }
}

// Generate a thumbnail for a video (text-to-image with overlay-ready composition)
export async function generateThumbnail(videoTitle: string, niche: string, opts: { style?: string } = {}): Promise<Buffer> {
  const style = opts.style || 'bold, eye-catching, high contrast, social media thumbnail style'
  const prompt = `A ${style} social media thumbnail image for a ${niche} video titled "${videoTitle}". 
The image should be visually striking, with space for text overlay. No text in the image itself.
Aspect ratio: 16:9 horizontal.`
  return generateImage(prompt, '1792x1024')
}

// ---- Image-to-Image (img2img) ----
// Takes an uploaded image (e.g. user's dog photo) and transforms it into a
// stylized thumbnail using Replicate's SDXL img2img model.
// prompt_strength controls how much the AI changes the image (0 = identical, 1 = completely different).
// For thumbnails we default to 0.35 — keeps the subject recognizable but adds thumbnail styling.

export async function generateThumbnailFromImage(
  imageBuffer: Buffer,
  prompt: string,
  opts: { promptStrength?: number; niche?: string } = {},
): Promise<{ url: string; model: string }> {
  const promptStrength = opts.promptStrength ?? 0.35
  const dataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`

  const fullPrompt = `${prompt}. Social media thumbnail style, bold, eye-catching, high contrast, professional. ${opts.niche ? `Niche: ${opts.niche}.` : ''}`

  const geminiKey = await getSecret('gemini.api_key')
  if (geminiKey) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: `${fullPrompt} Preserve the main subject and composition. Style strength: ${Math.round(promptStrength * 100)}%.` },
            { inlineData: { mimeType: 'image/png', data: imageBuffer.toString('base64') } },
          ] }],
        }),
      })
      const body: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Gemini returned ${res.status}`)
      const parts = body?.candidates?.[0]?.content?.parts || []
      const imagePart = parts.find((part: any) => part.inlineData?.data || part.inline_data?.data)
      const imageBase64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data
      const mimeType = imagePart?.inlineData?.mimeType || imagePart?.inline_data?.mime_type || 'image/png'
      if (imageBase64) return { url: `data:${mimeType};base64,${imageBase64}`, model: 'gemini-3.1-flash-image' }
    } catch (err) {
      console.error('Gemini image editing failed; trying Replicate:', err)
    }
  }

  const openrouterKey = await getSecret('openrouter.api_key')
  if (openrouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://content-forge-sepia.vercel.app',
          'X-Title': 'ContentForge',
        },
        body: JSON.stringify({
          model: 'google/gemini-3.1-flash-image',
          prompt: `${fullPrompt} Preserve the main subject and composition.`,
          aspect_ratio: '16:9',
          output_format: 'png',
          input_references: [{ type: 'image_url', image_url: { url: dataUri } }],
        }),
      })
      const body: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `OpenRouter returned ${res.status}`)
      const imageBase64 = body?.data?.[0]?.b64_json
      if (imageBase64) return { url: `data:image/png;base64,${imageBase64}`, model: 'openrouter-gemini-image' }
    } catch (err) {
      console.error('OpenRouter image editing failed; trying Replicate:', err)
    }
  }

  const token = await getSecret('replicate.api_token')
  if (!token) throw new Error('Gemini image editing failed and no Replicate API token is available.')

  // SDXL img2img — takes an init_image and transforms it based on the prompt
  const prediction = await createOfficialReplicatePrediction(
    'black-forest-labs/flux-dev',
    {
      image: dataUri,
      prompt: fullPrompt,
      prompt_strength: promptStrength,
      num_outputs: 1,
      aspect_ratio: '16:9',
      output_format: 'png',
    },
  )

  let finalPrediction = prediction
  if (prediction.status !== 'succeeded') {
    finalPrediction = await pollReplicatePrediction(prediction.urls.get)
  }

  const output = Array.isArray(finalPrediction.output) ? finalPrediction.output[0] : finalPrediction.output
  return { url: output, model: 'flux-dev-img2img' }
}

// Download a file from URL to local storage
export async function downloadToFile(url: string, filepath: string): Promise<void> {
  await ensureDirs()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(filepath, buffer)
}
