import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { generateImage, generateThumbnail, generateVideoFromText, isReplicateConfigured, downloadToFile } from '@/lib/generate'
import { getDirs, ensureDirs } from '@/lib/storage'
import path from 'path'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 300

// Generate an image (uses ZAI built-in, no API key needed)
// Supports both JSON (text-only) and multipart/form-data (with image upload for img2img)
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''

  let type: string
  let prompt: string | undefined
  let videoId: string | undefined
  let title: string | undefined
  let niche = 'pet content'
  let promptStrength: number | undefined
  let uploadedImage: Buffer | undefined

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    type = formData.get('type') as string
    prompt = formData.get('prompt') as string || undefined
    videoId = formData.get('videoId') as string || undefined
    title = formData.get('title') as string || undefined
    niche = (formData.get('niche') as string) || 'pet content'
    promptStrength = formData.get('promptStrength') ? parseFloat(formData.get('promptStrength') as string) : undefined
    const imageFile = formData.get('image') as File | null
    if (imageFile) {
      uploadedImage = Buffer.from(await imageFile.arrayBuffer())
    }
  } else {
    const body = await req.json()
    type = body.type
    prompt = body.prompt
    videoId = body.videoId
    title = body.title
    niche = body.niche || 'pet content'
    promptStrength = body.promptStrength
  }

  if (!type || (!prompt && !title)) {
    return NextResponse.json({ error: 'Missing type or prompt/title' }, { status: 400 })
  }

  await ensureDirs()

  try {
    if (type === 'image') {
      const asset = await db.generatedAsset.create({
        data: { type: 'image', prompt, modelUsed: 'zai-image', status: 'generating' },
      })
      const buffer = await generateImage(prompt!, '1024x1024')
      const { assets } = getDirs()
      const filepath = path.join(assets, `img_${asset.id}.png`)
      const { promises: fs } = await import('fs')
      await fs.writeFile(filepath, buffer)
      const updated = await db.generatedAsset.update({
        where: { id: asset.id },
        data: { status: 'ready', filePath: filepath, publicUrl: `/api/generate/assets/${asset.id}` },
      })
      return NextResponse.json({ asset: updated })
    }

    if (type === 'thumbnail') {
      // NEW: If an image was uploaded, use img2img via Replicate
      if (uploadedImage) {
        const configured = await isReplicateConfigured()
        if (!configured) {
          return NextResponse.json({ error: 'Replicate API token required for image-to-image. Add it in Settings → API Keys.' }, { status: 400 })
        }
        const { generateThumbnailFromImage, downloadToFile } = await import('@/lib/generate')
        const asset = await db.generatedAsset.create({
          data: {
            type: 'thumbnail',
            prompt: `${title || prompt} (img2img)`,
            modelUsed: 'sdxl-img2img',
            status: 'generating',
            videoId: videoId || null,
          },
        })
        // Run in background — Replicate can take 30-60 seconds
        after(async () => {
          try {
            const result = await generateThumbnailFromImage(uploadedImage!, title || prompt || '', {
              promptStrength,
              niche,
            })
            const { assets } = getDirs()
            await ensureDirs()
            const filepath = path.join(assets, `thumb_${asset.id}.png`)
            await downloadToFile(result.url, filepath)
            await db.generatedAsset.update({
              where: { id: asset.id },
              data: { status: 'ready', filePath: filepath, publicUrl: `/api/generate/assets/${asset.id}` },
            })
          } catch (err: any) {
            await db.generatedAsset.update({
              where: { id: asset.id },
              data: { status: 'failed', errorMessage: err?.message || String(err) },
            })
          }
        })
        return NextResponse.json({ asset, message: 'Image-to-image thumbnail generation started. Check back in 30-60 seconds.' })
      }

      // Standard text-to-image thumbnail (no upload)
      const asset = await db.generatedAsset.create({
        data: { type: 'thumbnail', prompt: title || prompt, modelUsed: 'zai-image', status: 'generating', videoId: videoId || null },
      })
      const buffer = await generateThumbnail(title || prompt!, niche)
      const { assets } = getDirs()
      const filepath = path.join(assets, `thumb_${asset.id}.png`)
      const { promises: fs } = await import('fs')
      await fs.writeFile(filepath, buffer)
      const updated = await db.generatedAsset.update({
        where: { id: asset.id },
        data: { status: 'ready', filePath: filepath, publicUrl: `/api/generate/assets/${asset.id}` },
      })
      return NextResponse.json({ asset: updated })
    }

    if (type === 'broll') {
      // Text-to-video via Replicate
      const configured = await isReplicateConfigured()
      if (!configured) {
        return NextResponse.json({ error: 'Replicate API token not set. Go to Settings → API Keys to add it.' }, { status: 400 })
      }
      const asset = await db.generatedAsset.create({
        data: { type: 'broll', prompt, modelUsed: 'stable-video-diffusion', status: 'generating' },
      })
      // Run in background — Replicate can take minutes
      after(async () => {
        try {
          const result = await generateVideoFromText(prompt)
          const { assets } = getDirs()
          await ensureDirs()
          const filepath = path.join(assets, `broll_${asset.id}.mp4`)
          await downloadToFile(result.url, filepath)
          await db.generatedAsset.update({
            where: { id: asset.id },
            data: { status: 'ready', filePath: filepath, publicUrl: result.url, thumbnailUrl: `/api/generate/assets/${asset.id}` },
          })
        } catch (err: any) {
          await db.generatedAsset.update({
            where: { id: asset.id },
            data: { status: 'failed', errorMessage: err?.message || String(err) },
          })
        }
      })
      return NextResponse.json({ asset, message: 'Video generation started. Check back in a few minutes.' })
    }

    return NextResponse.json({ error: 'Invalid type. Use image, thumbnail, or broll.' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Generation failed' }, { status: 500 })
  }
}

// List generated assets
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  const where: any = {}
  if (type) where.type = type
  const assets = await db.generatedAsset.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({
    assets: assets.map(a => ({
      id: a.id,
      type: a.type,
      prompt: a.prompt,
      status: a.status,
      modelUsed: a.modelUsed,
      url: a.publicUrl ? `/api/generate/assets/${a.id}` : null,
      thumbnailUrl: a.thumbnailUrl,
      videoId: a.videoId,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt,
    })),
  })
}
