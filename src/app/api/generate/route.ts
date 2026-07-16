import { NextRequest, NextResponse, after } from 'next/server'
import { generateImage, generateThumbnail, generateVideoFromText, isReplicateConfigured } from '@/lib/generate'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 300

async function storeGeneratedFile(supabase: any, userId: string, buffer: Buffer, assetId: string, extension: string, contentType: string) {
  const storagePath = `${userId}/generated/${assetId}.${extension}`
  const { error } = await supabase.storage.from('content-media').upload(storagePath, buffer, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`Could not save the generated file: ${error.message}`)
  return storagePath
}

async function storeGeneratedUrl(supabase: any, userId: string, url: string, assetId: string, extension: string, contentType: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download the generated file (${response.status})`)
  return storeGeneratedFile(supabase, userId, Buffer.from(await response.arrayBuffer()), assetId, extension, contentType)
}

// Generate an image with a configured production AI provider.
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please log in again before generating content.' }, { status: 401 })
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (membershipError || !membership) {
    return NextResponse.json({ error: 'Your workspace is not ready. Please sign out and back in.' }, { status: 409 })
  }
  const userId = user.id
  const workspaceId = membership.workspace_id

  async function createAsset(assetType: string, assetPrompt: string, modelUsed: string) {
    const id = randomUUID()
    const isVideo = assetType === 'broll'
    const extension = isVideo ? 'mp4' : 'png'
    const { data, error } = await supabase.from('content_items').insert({
      id,
      workspace_id: workspaceId,
      user_id: userId,
      filename: `${assetType}-${id.slice(0, 8)}.${extension}`,
      kind: isVideo ? 'video' : 'slideshow',
      mime_type: isVideo ? 'video/mp4' : 'image/png',
      size_bytes: 0,
      source_paths: [],
      status: 'processing',
      progress: 10,
      current_step: 'Generating with AI',
      metadata: { source: 'ai-generation', asset_type: assetType, prompt: assetPrompt, model_used: modelUsed },
    }).select('*').single()
    if (error || !data) throw new Error(`Could not create the generation record: ${error?.message || 'unknown database error'}`)
    return data
  }

  let activeAssetId: string | undefined
  try {
    if (type === 'image') {
      const asset = await createAsset('image', prompt!, 'ai-image')
      activeAssetId = asset.id
      const buffer = await generateImage(prompt!, '1024x1024')
      const filepath = await storeGeneratedFile(supabase, userId, buffer, asset.id, 'png', 'image/png')
      const { data: updated, error } = await supabase.from('content_items').update({
        status: 'ready', progress: 100, current_step: 'Ready', output_path: filepath, thumbnail_path: filepath, size_bytes: buffer.length,
      }).eq('id', asset.id).select('*').single()
      if (error || !updated) throw new Error(`Could not finish the generation record: ${error?.message || 'unknown database error'}`)
      return NextResponse.json({ asset: updated })
    }

    if (type === 'thumbnail') {
      // NEW: If an image was uploaded, use img2img via Replicate
      if (uploadedImage) {
        const configured = await isReplicateConfigured()
        if (!configured) {
          return NextResponse.json({ error: 'Replicate API token required for image-to-image. Add it in Settings → API Keys.' }, { status: 400 })
        }
        const { generateThumbnailFromImage } = await import('@/lib/generate')
        const asset = await createAsset('thumbnail', `${title || prompt} (img2img)`, 'flux-dev-img2img')
        // Run in background — Replicate can take 30-60 seconds
        after(async () => {
          try {
            const result = await generateThumbnailFromImage(uploadedImage!, title || prompt || '', {
              promptStrength,
              niche,
            })
            const filepath = await storeGeneratedUrl(supabase, userId, result.url, asset.id, 'png', 'image/png')
            await supabase.from('content_items').update({
              status: 'ready', progress: 100, current_step: 'Ready', output_path: filepath, thumbnail_path: filepath,
            }).eq('id', asset.id)
          } catch (err: any) {
            await supabase.from('content_items').update({
              status: 'failed', error_message: err?.message || String(err), current_step: 'Generation failed',
            }).eq('id', asset.id)
          }
        })
        return NextResponse.json({ asset, message: 'Image-to-image thumbnail generation started. Check back in 30-60 seconds.' })
      }

      // Standard text-to-image thumbnail (no upload)
      const asset = await createAsset('thumbnail', (title || prompt)!, 'ai-image')
      activeAssetId = asset.id
      const buffer = await generateThumbnail(title || prompt!, niche)
      const filepath = await storeGeneratedFile(supabase, userId, buffer, asset.id, 'png', 'image/png')
      const { data: updated, error } = await supabase.from('content_items').update({
        status: 'ready', progress: 100, current_step: 'Ready', output_path: filepath, thumbnail_path: filepath, size_bytes: buffer.length,
      }).eq('id', asset.id).select('*').single()
      if (error || !updated) throw new Error(`Could not finish the generation record: ${error?.message || 'unknown database error'}`)
      return NextResponse.json({ asset: updated })
    }

    if (type === 'broll') {
      // Text-to-video via Replicate
      const configured = await isReplicateConfigured()
      if (!configured) {
        return NextResponse.json({ error: 'Replicate API token not set. Go to Settings → API Keys to add it.' }, { status: 400 })
      }
      const asset = await createAsset('broll', prompt!, 'seedance-1-pro')
      // Run in background — Replicate can take minutes
      after(async () => {
        try {
          const result = await generateVideoFromText(prompt!)
          const filepath = await storeGeneratedUrl(supabase, userId, result.url, asset.id, 'mp4', 'video/mp4')
          await supabase.from('content_items').update({
            status: 'ready', progress: 100, current_step: 'Ready', output_path: filepath,
          }).eq('id', asset.id)
        } catch (err: any) {
          await supabase.from('content_items').update({
            status: 'failed', error_message: err?.message || String(err), current_step: 'Generation failed',
          }).eq('id', asset.id)
        }
      })
      return NextResponse.json({ asset, message: 'Video generation started. Check back in a few minutes.' })
    }

    return NextResponse.json({ error: 'Invalid type. Use image, thumbnail, or broll.' }, { status: 400 })
  } catch (err: any) {
    if (activeAssetId) {
      await supabase.from('content_items').update({
        status: 'failed', error_message: err?.message || String(err), current_step: 'Generation failed',
      }).eq('id', activeAssetId)
    }
    return NextResponse.json({ error: err?.message || 'Generation failed' }, { status: 500 })
  }
}

// List generated assets
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const type = req.nextUrl.searchParams.get('type')
  let query = supabase.from('content_items').select('*').eq('user_id', user.id).contains('metadata', { source: 'ai-generation' })
  if (type) query = query.contains('metadata', { asset_type: type })
  const { data: assets, error } = await query.order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: `Could not load generated assets: ${error.message}` }, { status: 500 })
  return NextResponse.json({
    assets: (assets || []).map((a: any) => ({
      id: a.id,
      type: a.metadata?.asset_type,
      prompt: a.metadata?.prompt,
      status: a.status === 'processing' ? 'generating' : a.status,
      modelUsed: a.metadata?.model_used,
      url: a.output_path ? `/api/generate/assets/${a.id}` : null,
      thumbnailUrl: a.thumbnail_path ? `/api/generate/assets/${a.id}` : null,
      videoId: a.metadata?.video_id || null,
      errorMessage: a.error_message,
      createdAt: a.created_at,
    })),
  })
}
