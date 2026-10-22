import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
const schema = z.object({ itemId: z.string().uuid() })
export async function POST(req: NextRequest) {
  const supabase = await createClient(), { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
  const { error } = await supabase.rpc('finish_media_upload', { item_id: parsed.data.itemId })
  if (error) return NextResponse.json({ error: 'Upload is incomplete. Retry the upload before processing.' }, { status: 409 })
  return NextResponse.json({ ok: true, itemId: parsed.data.itemId })
}
