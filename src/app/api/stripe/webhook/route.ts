import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

export async function POST(request: Request) {
  const signature = (await headers()).get('stripe-signature'); const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  const stripe = getStripe(); let event
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, secret) } catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }) }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  if (event.type === 'checkout.session.completed') { const session = event.data.object; const userId = session.metadata?.user_id; if (userId) await admin.from('profiles').update({ stripe_customer_id: String(session.customer), plan: session.metadata?.plan || 'creator', subscription_status: 'active' }).eq('id', userId) }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') { const subscription = event.data.object; await admin.from('profiles').update({ subscription_status: subscription.status, plan: subscription.status === 'active' ? undefined : 'free' }).eq('stripe_customer_id', String(subscription.customer)) }
  return NextResponse.json({ received: true })
}
