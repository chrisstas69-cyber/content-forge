import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { data } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
  if (!data?.stripe_customer_id) return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
  const session = await getStripe().billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${request.nextUrl.origin}/app` })
  return NextResponse.json({ url: session.url })
}
