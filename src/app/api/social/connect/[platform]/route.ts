import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { platforms } from '@/lib/social'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform: platformKey } = await ctx.params
  const platform = platforms[platformKey]
  if (!platform) return NextResponse.json({ error: 'Unknown platform' }, { status: 404 })

  const state = randomBytes(16).toString('hex')
  // Store state in DB for verification (use Setting table)
  await db.setting.upsert({
    where: { id: `oauth.state.${state}` },
    create: { id: `oauth.state.${state}`, value: platformKey },
    update: { value: platformKey },
  })

  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/social/callback/${platformKey}`
  const url = platform.oauthUrl(redirectUri, state)
  return NextResponse.redirect(url)
}
