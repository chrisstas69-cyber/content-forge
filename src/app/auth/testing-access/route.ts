import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeNext(request: NextRequest) {
  const next = request.nextUrl.searchParams.get('next') || '/app'
  return next.startsWith('/') && !next.startsWith('//') ? next : '/app'
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const email = process.env.TEST_MODE_USER_EMAIL

  if (process.env.TEST_MODE_ENABLED !== 'true' || !url || !serviceKey || !email) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const admin = createAdminClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = data?.properties?.hashed_token
  if (error || !tokenHash) {
    console.error('Could not create testing session:', error)
    return NextResponse.redirect(new URL('/login?error=Testing%20mode%20could%20not%20start.', request.url))
  }

  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (verifyError) {
    console.error('Could not verify testing session:', verifyError)
    return NextResponse.redirect(new URL('/login?error=Testing%20mode%20could%20not%20start.', request.url))
  }

  return NextResponse.redirect(new URL(safeNext(request), request.url))
}
