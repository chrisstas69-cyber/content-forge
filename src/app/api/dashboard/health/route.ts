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
    const ready = Object.values(configuration).every(Boolean) && mediaReady && storageReady
    return NextResponse.json({
      ready,
      configuration,
      authentication:{ready:true},
      database:{connected:true,mediaSchemaReady:mediaReady},
      storage:{mode:'supabase-private',persistent:true,ready:storageReady},
      processing:{queueReady:mediaReady,workerConnected:Boolean(process.env.CONTENT_WORKER_URL)},
      action:ready ? undefined : 'Apply the latest Supabase migration, then redeploy the Preview branch.',
    }, { status:ready?200:503 })
  } catch (error) {
    console.error('Readiness check failed:',error)
    return NextResponse.json({ready:false,configuration,action:'Check the Supabase environment variables and Vercel function logs.'},{status:503})
  }
}
