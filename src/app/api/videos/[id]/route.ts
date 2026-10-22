import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serializeContentItem, ContentItemRow } from '@/lib/content-items'
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params, supabase = await createClient(), { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { data } = await supabase.from('content_items').select('*').eq('id', id).single()
  return data ? NextResponse.json({ video: serializeContentItem(data as ContentItemRow) }) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}
export async function PATCH() { return NextResponse.json({ error: 'Edit and render this media in the studio.' }, { status: 410 }) }
export async function DELETE() { return NextResponse.json({ error: 'Media deletion is disabled during testing to preserve your originals.' }, { status: 409 }) }
