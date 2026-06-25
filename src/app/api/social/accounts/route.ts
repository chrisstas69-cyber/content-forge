import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const accounts = await db.socialAccount.findMany({ orderBy: { platform: 'asc' }, include: { posts: true } })
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
  })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await db.socialAccount.update({ where: { id }, data: { connected: false } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
