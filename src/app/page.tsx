import Link from 'next/link'
import { ArrowRight, BarChart3, Check, Film, Sparkles, UploadCloud, Wand2 } from 'lucide-react'

const features = [
  { icon: UploadCloud, title: 'Upload once', text: 'Start with a raw video or a set of photos.' },
  { icon: Wand2, title: 'Create automatically', text: 'Generate captions, formats, thumbnails, ideas and publishing copy.' },
  { icon: BarChart3, title: 'Publish smarter', text: 'Score content, schedule posts and learn what performs.' },
]

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-[#090909] text-white">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-bold"><span className="flex size-9 items-center justify-center rounded-xl bg-orange-500"><Sparkles className="size-5" /></span>ContentForge</Link>
        <div className="flex items-center gap-3"><Link href="/pricing" className="hidden text-sm text-neutral-300 hover:text-white sm:block">Pricing</Link><Link href="/login" className="rounded-lg px-4 py-2 text-sm text-neutral-200 hover:bg-white/10">Log in</Link><Link href="/signup" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold hover:bg-orange-400">Start free</Link></div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 pb-24 pt-20 text-center sm:pt-28">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-300"><Sparkles className="size-3.5" />Your AI content production workspace</div>
        <h1 className="mx-auto mt-7 max-w-4xl text-5xl font-black tracking-tight sm:text-7xl">Turn one raw video into a week of <span className="text-orange-500">publish-ready content.</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-400">Upload a video or photo. ContentForge adds captions, creates platform-ready formats, scores its potential and helps you publish everywhere.</p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 font-semibold hover:bg-orange-400">Create your first post <ArrowRight className="size-4" /></Link><Link href="#how-it-works" className="rounded-xl border border-white/15 px-6 py-3.5 font-semibold hover:bg-white/5">See how it works</Link></div>
        <p className="mt-4 text-xs text-neutral-500">No credit card required · Private workspace · Cancel anytime</p>
      </section>

      <section id="how-it-works" className="border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-20 md:grid-cols-3">{features.map(({ icon: Icon, title, text }, index) => <div key={title} className="rounded-2xl border border-white/10 bg-neutral-950 p-6"><span className="text-xs font-bold text-orange-500">0{index + 1}</span><Icon className="mt-7 size-7 text-orange-500" /><h2 className="mt-4 text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-neutral-400">{text}</p></div>)}</div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-24 text-center"><Film className="mx-auto size-10 text-orange-500" /><h2 className="mt-5 text-3xl font-bold">Built for creators who would rather create than manage tools.</h2><div className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-2">{['Three platform-ready formats','AI captions and thumbnails','Content ideas and scripts','Scheduling and analytics'].map(item => <div key={item} className="flex items-center gap-3 text-sm text-neutral-300"><Check className="size-4 text-emerald-400" />{item}</div>)}</div></section>

      <footer className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-8 text-xs text-neutral-500 sm:flex-row"><span>© 2026 ContentForge</span><div className="flex gap-5"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/pricing">Pricing</Link></div></div></footer>
    </main>
  )
}
