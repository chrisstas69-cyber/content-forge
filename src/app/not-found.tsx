import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-sm">
          <Sparkles className="size-6 text-white" />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-orange-600">Error 404</p>
        <h1 className="mt-2 text-3xl font-bold">That page isn’t in your workspace</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-500">The address may be outdated or mistyped. Your content is safe—return to the dashboard to continue.</p>
        <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
          <ArrowLeft className="size-4" /> Return to dashboard
        </Link>
      </div>
    </main>
  )
}
