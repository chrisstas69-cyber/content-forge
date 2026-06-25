import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { platforms } from '@/lib/social'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform: platformKey } = await ctx.params
  const platform = platforms[platformKey]
  if (!platform) return NextResponse.json({ error: 'Unknown platform' }, { status: 404 })

  // Check if credentials are configured
  const configured = await platform.isConfigured()
  if (!configured) {
    return NextResponse.redirect(`${req.nextUrl.origin}/?social_error=${encodeURIComponent(`${platform.displayName} API credentials are not set. Go to Settings → API Keys to add them.`)}`)
  }

  const state = randomBytes(16).toString('hex')
  await db.setting.upsert({
    where: { id: `oauth.state.${state}` },
    create: { id: `oauth.state.${state}`, value: platformKey },
    update: { value: platformKey },
  })

  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/social/callback/${platformKey}`
  try {
    const url = await platform.oauthUrl(redirectUri, state)
    return NextResponse.redirect(url)
  } catch (err: any) {
    return NextResponse.redirect(`${req.nextUrl.origin}/?social_error=${encodeURIComponent(err.message)}`)
  }
}
