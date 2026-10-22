import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

const protectedPrefixes = ['/api/studio', '/app', '/api/videos', '/api/uploads', '/api/media', '/api/generate', '/api/secrets', '/api/settings', '/api/assets', '/api/social', '/api/agent', '/api/analytics', '/api/ideas', '/api/insights', '/api/calendar', '/api/brandkit', '/api/voice-profile', '/api/posts', '/api/dashboard', '/api/analyze', '/api/frameworks', '/api/competitors', '/api/billing', '/api/events', '/api/comments', '/api/cron', '/api/trends']
const cronPaths = new Set(['/api/cron/publish-scheduled', '/api/trends/refresh', '/api/analytics/refresh', '/api/insights/refresh', '/api/comments', '/api/competitors/refresh'])
const retiredPrefixes = ['/api/generate', '/api/secrets', '/api/settings', '/api/assets', '/api/social', '/api/agent', '/api/analytics', '/api/ideas', '/api/insights', '/api/calendar', '/api/brandkit', '/api/voice-profile', '/api/posts', '/api/analyze', '/api/frameworks', '/api/competitors', '/api/billing', '/api/events', '/api/comments', '/api/cron', '/api/trends']
const retired = (pathname: string) => retiredPrefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/')) || /^\/api\/videos\/[^/]+\/(process|publish|repurpose|translate)$/.test(pathname)
const authPages = ['/login', '/signup']
const testAuthPath = '/auth/testing-access'
const productionHost = 'content-forge-sepia.vercel.app'
const legacyProductionHosts = new Set(['content-forge-chrisstas69-gmailcoms-projects.vercel.app'])

export async function proxy(request: NextRequest) {
  const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  if (legacyProductionHosts.has(requestHost.split(':')[0])) {
    const canonicalUrl = request.nextUrl.clone()
    canonicalUrl.protocol = 'https:'
    canonicalUrl.host = productionHost
    return NextResponse.redirect(canonicalUrl, 308)
  }

  let response = NextResponse.next({ request })
  const cronSecret = process.env.CRON_SECRET
  if (request.method === 'GET' && cronPaths.has(request.nextUrl.pathname) && cronSecret) {
    const provided = Buffer.from(request.headers.get('authorization') || '')
    const expected = Buffer.from(`Bearer ${cronSecret}`)
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return retired(request.nextUrl.pathname) ? NextResponse.json({error:'This legacy automation has been retired. Use the studio workflow.'},{status:410}) : response
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    if (protectedPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))) {
      if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication is not configured' }, { status: 503 })
      return NextResponse.redirect(new URL('/login?error=SaaS%20authentication%20is%20not%20configured.', request.url))
    }
    return response
  }

  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll(cookies) { cookies.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } } })
  const { data: { user } } = await supabase.auth.getUser()
  const isProtected = protectedPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))
  const testMode = process.env.TEST_MODE_ENABLED === 'true' && Boolean(process.env.TEST_MODE_USER_EMAIL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  const testUserMismatch = testMode && Boolean(user && user.email !== process.env.TEST_MODE_USER_EMAIL)
  if (isProtected && (!user || testUserMismatch)) {
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (testMode) return NextResponse.redirect(new URL(`${testAuthPath}?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`, request.url))
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('Please log in to continue.')}`, request.url))
  }
  if (testMode && !user && (authPages.includes(request.nextUrl.pathname) || request.nextUrl.pathname === '/')) return NextResponse.redirect(new URL(testAuthPath, request.url))
  if (user && authPages.includes(request.nextUrl.pathname)) return NextResponse.redirect(new URL('/app', request.url))
  if (user && retired(request.nextUrl.pathname)) return NextResponse.json({error:'This feature has been retired. Use the studio for media, drafts, and publishing.'},{status:410})
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
