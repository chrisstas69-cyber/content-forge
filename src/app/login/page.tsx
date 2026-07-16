import Link from 'next/link'
import { login } from '../auth/actions'
import { Sparkles } from 'lucide-react'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams
  return <AuthShell title="Welcome back" subtitle="Log in to your ContentForge workspace."><form action={login} className="space-y-4"><Field name="email" label="Email" type="email" /><Field name="password" label="Password" type="password" />{params.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{params.error}</p>}{params.message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{params.message}</p>}<button className="w-full rounded-lg bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600">Log in</button></form><p className="mt-5 text-center text-sm text-neutral-500">New here? <Link href="/signup" className="font-medium text-orange-600">Create an account</Link></p></AuthShell>
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-12"><div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl"><Link href="/" className="mb-7 flex items-center gap-2 font-bold"><span className="flex size-9 items-center justify-center rounded-xl bg-orange-500 text-white"><Sparkles className="size-5" /></span>ContentForge</Link><h1 className="text-2xl font-bold">{title}</h1><p className="mb-6 mt-1 text-sm text-neutral-500">{subtitle}</p>{children}</div></main> }
export function Field({ name, label, type = 'text' }: { name: string; label: string; type?: string }) { return <label className="block text-sm font-medium text-neutral-800">{label}<input required name={name} type={type} className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label> }
