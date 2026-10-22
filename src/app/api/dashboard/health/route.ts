import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const configuration = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    encryptionKey: Boolean(process.env.ENCRYPTION_KEY),
  }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ready:false, configuration, authentication:{ready:false}, action:'Log in and open this check again.' }, { status:401 })
    const [{ error:mediaError }, { error:storageError }] = await Promise.all([
      supabase.from('content_items').select('id').limit(1),
      supabase.storage.from('content-media').list(user.id, { limit:1 }),
    ])
    const mediaReady = !mediaError
    const storageReady = !storageError
    let workerConnected = false
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const {createClient:adminClient}=await import('@supabase/supabase-js')
      const admin=adminClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
      const {data}=await admin.from('worker_heartbeats').select('seen_at').order('seen_at',{ascending:false}).limit(1)
      workerConnected=Boolean(data?.[0] && Date.now()-Date.parse(data[0].seen_at)<90000)
    }
    if (process.env.CONTENT_WORKER_URL) {
      try {
        const workerResponse = await fetch(new URL('/health', process.env.CONTENT_WORKER_URL), {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        })
        const workerHealth = workerResponse.ok ? await workerResponse.json() : null
        workerConnected = workerHealth?.ok === true
      } catch {
        workerConnected = false
      }
    }
    const ready = Object.values(configuration).every(Boolean) && mediaReady && storageReady && workerConnected
    return NextResponse.json({
      ready,
      configuration,
      authentication:{ready:true},
      database:{connected:true,mediaSchemaReady:mediaReady},
      storage:{mode:'supabase-private',persistent:true,ready:storageReady},
      processing:{queueReady:mediaReady,workerConnected},
      action:ready ? undefined : !mediaReady || !storageReady
        ? 'Apply the latest Supabase migration and check private media storage.'
        : !workerConnected
          ? 'Start the Mac media worker. Its heartbeat will appear here automatically.'
          : 'Configure the missing environment variables and redeploy.',
    }, { status:ready?200:503 })
  } catch (error) {
    console.error('Readiness check failed:',error)
    return NextResponse.json({ready:false,configuration,action:'Check the Supabase environment variables and Vercel function logs.'},{status:503})
  }
}
