import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function databaseErrorHint(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/P1001|Can't reach database server|ECONNREFUSED|connection/i.test(message)) {
    return 'The database cannot be reached. Check DATABASE_URL, URL-encode reserved password characters, and redeploy.'
  }

  if (/P2021|does not exist|relation .* does not exist/i.test(message)) {
    return 'The ContentForge database tables are missing. For a controlled preview migration, set RUN_LEGACY_DB_PUSH=true for one intentional Vercel deployment, review the build log, then remove the flag.'
  }

  return 'The dashboard database request failed. Open /api/dashboard/health for a safe readiness report and check the Vercel function log.'
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const { data: items, error } = await supabase.from('content_items').select('status, metadata, created_at')
    if (error) throw error
    const rows = (items || []).filter(row => (row.metadata as any)?.source !== 'ai-generation')
    const scores = rows.map(row => Number((row.metadata as any)?.viralScore)).filter(Number.isFinite)

    return NextResponse.json({
      total: rows.length,
      ready: rows.filter(row => row.status === 'ready').length,
      published: 0,
      failed: rows.filter(row => row.status === 'failed').length,
      processing: rows.filter(row => ['uploading','queued','processing'].includes(row.status)).length,
      connectedAccounts: 0, accountsByPlatform: {}, totalPosts: 0, publishedPosts: 0,
      avgViralScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      recentVideos: rows.filter(row => new Date(row.created_at) >= sevenDaysAgo).length,
      scheduled: 0,
      totalFormats: rows.filter(row => row.status === 'ready').length,
    })
  } catch (error) {
    console.error('Dashboard stats failed:', error)
    return NextResponse.json({ error: databaseErrorHint(error) }, { status: 503 })
  }
}
