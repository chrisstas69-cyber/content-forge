import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { platforms } from '@/lib/social'
import { getSecret } from '@/lib/secrets'

export const runtime = 'nodejs'

export async function GET() {
  const accounts = await db.socialAccount.findMany({ orderBy: { platform: 'asc' }, include: { posts: true } })

  // Also include "configured" status for each platform
  const platformStatus: Record<string, boolean> = {}
  for (const key of Object.keys(platforms)) {
    platformStatus[key] = await platforms[key].isConfigured()
  }
  // Add Replicate status (not in platforms map, but used for AI generation)
  const replicateToken = await getSecret('replicate.api_token')
  platformStatus.replicate = !!replicateToken

  return NextResponse.json({
    accounts: accounts.map(a => ({
      id: a.id,
      platform: a.platform,
      handle: a.handle,
      displayName: a.displayName,
      connected: a.connected,
      tokenExpiry: a.tokenExpiry,
      postCount: a.posts.length,
    })),
    platformStatus,
  })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await db.socialAccount.update({ where: { id }, data: { connected: false } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
