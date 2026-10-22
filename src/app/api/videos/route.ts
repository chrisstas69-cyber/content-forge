import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serializeContentItem, ContentItemRow } from '@/lib/content-items'
export async function GET() {
  const supabase = await createClient(), { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { data, error } = await supabase.from('content_items').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: 'Could not load the media library.' }, { status: 503 })
  return NextResponse.json({ videos: (data as ContentItemRow[]).map(serializeContentItem) })
}
export async function POST() { return NextResponse.json({ error: 'Upload through the studio for private, durable media processing.' }, { status: 410 }) }
