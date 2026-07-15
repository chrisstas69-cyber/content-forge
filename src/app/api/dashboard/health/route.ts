import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

function classifyDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/P1001|Can't reach database server|ECONNREFUSED|connection/i.test(message)) {
    return {
      code: 'DATABASE_UNREACHABLE',
      action: 'Check DATABASE_URL, URL-encode reserved password characters, and redeploy.',
    }
  }

  if (/P2021|does not exist|relation .* does not exist/i.test(message)) {
    return {
      code: 'LEGACY_SCHEMA_MISSING',
      action: 'Set RUN_LEGACY_DB_PUSH=true for one intentional Preview deployment, verify the schema sync, then remove the flag.',
    }
  }

  return {
    code: 'DATABASE_ERROR',
    action: 'Check the Vercel function logs for the dashboard health request.',
  }
}

export async function GET() {
  const configuration = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    databaseUrl: Boolean(process.env.DATABASE_URL),
    encryptionKey: Boolean(process.env.ENCRYPTION_KEY),
  }

  try {
    await db.$queryRaw`SELECT 1`
    await db.video.count()

    return NextResponse.json({
      ready: Object.values(configuration).every(Boolean),
      configuration,
      database: {
        connected: true,
        legacySchemaReady: true,
      },
      storage: {
        mode: process.env.VERCEL === '1' ? 'temporary-preview' : 'local',
        persistent: process.env.VERCEL !== '1',
      },
    })
  } catch (error) {
    const issue = classifyDatabaseError(error)
    return NextResponse.json({
      ready: false,
      configuration,
      database: {
        connected: issue.code !== 'DATABASE_UNREACHABLE',
        legacySchemaReady: false,
        issue,
      },
      storage: {
        mode: process.env.VERCEL === '1' ? 'temporary-preview' : 'local',
        persistent: process.env.VERCEL !== '1',
      },
    }, { status: 503 })
  }
}
