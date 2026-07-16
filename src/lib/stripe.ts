import Stripe from 'stripe'

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe is not configured')
  return new Stripe(key)
}

export const plans = {
  creator: { name: 'Creator', price: 19, priceId: process.env.STRIPE_CREATOR_PRICE_ID, credits: 50 },
  pro: { name: 'Pro', price: 49, priceId: process.env.STRIPE_PRO_PRICE_ID, credits: 200 },
} as const
