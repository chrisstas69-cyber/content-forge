'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function value(formData: FormData, name: string) { return String(formData.get(name) || '').trim() }

export async function login(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: value(formData, 'email'), password: value(formData, 'password') })
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
  redirect('/app')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({ email: value(formData, 'email'), password: value(formData, 'password'), options: { data: { full_name: value(formData, 'name') } } })
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`)
  redirect('/login?message=Check%20your%20email%20to%20confirm%20your%20account.')
}

export async function logout() { const supabase = await createClient(); await supabase.auth.signOut(); redirect('/') }
