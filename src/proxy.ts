import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const protectedPrefixes = ['/app', '/api/videos', '/api/uploads', '/api/media', '/api/generate', '/api/secrets', '/api/settings', '/api/assets', '/api/social', '/api/agent', '/api/analytics', '/api/ideas', '/api/insights', '/api/calendar', '/api/brandkit', '/api/voice-profile', '/api/posts', '/api/dashboard', '/api/analyze', '/api/frameworks', '/api/competitors', '/api/billing']
const authPages = ['/login', '/signup']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    if (protectedPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))) return NextResponse.redirect(new URL('/login?error=SaaS%20authentication%20is%20not%20configured.', request.url))
    return response
  }

  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll(cookies) { cookies.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } } })
  const { data: { user } } = await supabase.auth.getUser()
  const isProtected = protectedPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))
  if (isProtected && !user) {
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('Please log in to continue.')}`, request.url))
  }
  if (user && authPages.includes(request.nextUrl.pathname)) return NextResponse.redirect(new URL('/app', request.url))
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
