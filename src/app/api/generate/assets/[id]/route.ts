import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { data: asset, error: assetError } = await supabase.from('content_items')
    .select('output_path,mime_type,user_id,metadata').eq('id', id).single()
  if (assetError || !asset || asset.user_id !== user.id || asset.metadata?.source !== 'ai-generation' || !asset.output_path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { data, error } = await supabase.storage.from('content-media').download(asset.output_path)
  if (error || !data) return NextResponse.json({ error: 'Generated file is unavailable' }, { status: 404 })
  const buf = Buffer.from(await data.arrayBuffer())
  const contentType = asset.mime_type || 'application/octet-stream'
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
