import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { platforms } from '@/lib/social'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform: platformKey } = await ctx.params
  const platform = platforms[platformKey]
  if (!platform) return NextResponse.json({ error: 'Unknown platform' }, { status: 404 })

  const url = req.nextUrl
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${url.origin}/?social_error=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${url.origin}/?social_error=missing_code_or_state`)
  }

  // Verify state
  const stateSetting = await db.setting.findUnique({ where: { id: `oauth.state.${state}` } })
  if (!stateSetting || stateSetting.value !== platformKey) {
    return NextResponse.redirect(`${url.origin}/?social_error=invalid_state`)
  }
  await db.setting.delete({ where: { id: `oauth.state.${state}` } }).catch(() => {})

  const redirectUri = `${url.origin}/api/social/callback/${platformKey}`
  try {
    const tokens = await platform.exchangeCode(code, redirectUri)
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null

    // Upsert account (one per platform-handle combo)
    const existing = await db.socialAccount.findFirst({
      where: { platform: platformKey, handle: tokens.handle || 'unknown' },
    })
    let account
    if (existing) {
      account = await db.socialAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || existing.refreshToken,
          tokenExpiry: expiresAt,
          metadata: tokens.metadata || existing.metadata,
          displayName: tokens.displayName || existing.displayName,
          connected: true,
        },
      })
    } else {
      account = await db.socialAccount.create({
        data: {
          platform: platformKey,
          handle: tokens.handle || 'unknown',
          displayName: tokens.displayName || tokens.handle || platform.displayName,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || '',
          tokenExpiry: expiresAt,
          metadata: tokens.metadata || '',
          connected: true,
        },
      })
    }
    return NextResponse.redirect(`${url.origin}/?social_connected=${platformKey}`)
  } catch (err: any) {
    return NextResponse.redirect(`${url.origin}/?social_error=${encodeURIComponent(err?.message || 'OAuth failed')}`)
  }
}
