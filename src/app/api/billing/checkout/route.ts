import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, plans } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { plan } = await request.json() as { plan: keyof typeof plans }
  const selected = plans[plan]
  if (!selected?.priceId) return NextResponse.json({ error: 'This plan is not configured' }, { status: 503 })
  const stripe = getStripe()
  const origin = request.nextUrl.origin
  const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer_email: user.email, line_items: [{ price: selected.priceId, quantity: 1 }], success_url: `${origin}/app?billing=success`, cancel_url: `${origin}/pricing?billing=cancelled`, allow_promotion_codes: true, subscription_data: { metadata: { user_id: user.id, plan } }, metadata: { user_id: user.id, plan } })
  return NextResponse.json({ url: session.url })
}
