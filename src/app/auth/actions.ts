'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function value(formData: FormData, name: string) {
  return String(formData.get(name) || '').trim()
}

async function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https')

  if (!host) throw new Error('Unable to determine the application URL')
  return `${protocol}://${host}`
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: value(formData, 'email'),
    password: value(formData, 'password'),
  })

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
  redirect('/app')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  const siteUrl = await getSiteUrl()
  const { error } = await supabase.auth.signUp({
    email: value(formData, 'email'),
    password: value(formData, 'password'),
    options: {
      data: { full_name: value(formData, 'name') },
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  })

  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`)
  redirect('/login?message=Check%20your%20email%20to%20confirm%20your%20account.')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
