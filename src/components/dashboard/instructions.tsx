'use client'

import { useState, useEffect } from 'react'
import { BookOpen, HelpCircle, ChevronDown, Video, Key, Upload, Volume2, Play, ExternalLink, Download, Search, Sparkles, Database, FileText } from 'lucide-react'

interface FAQItemProps {
  question: string
  answer: string
}

function FAQItem({ question, answer }: FAQItemProps) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 py-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left font-medium text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none"
      >
        <span>{question}</span>
        <ChevronDown className={`size-4 text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-3xl">
          {answer}
        </p>
      )}
    </div>
  )
}

export function Instructions() {
  const [search, setSearch] = useState('')
  const [youtubeLinks, setYoutubeLinks] = useState<Record<string, string>>({})

  // Load custom tutorial links from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cf_tutorial_links')
      if (saved) setYoutubeLinks(JSON.parse(saved))
    } catch {}
  }, [])

  const updateLink = (id: string, url: string) => {
    const updated = { ...youtubeLinks, [id]: url }
    setYoutubeLinks(updated)
    try {
      localStorage.setItem('cf_tutorial_links', JSON.stringify(updated))
    } catch {}
  }

  const videoGuides = [
    { id: '1', title: 'Platform Overview & Welcome', duration: '2 min', description: 'Overview of the platform, workspace structure, and core features.' },
    { id: '2', title: 'Dashboard Tour', duration: '3 min', description: 'Tour of main analytics, system status, and recent posts.' },
    { id: '3', title: 'Uploading Videos', duration: '5 min', description: 'Walkthrough of uploading files, transcribing pipeline, and progress monitoring.' },
    { id: '4', title: 'Uploading Photos to Video', duration: '4 min', description: 'Learn how to stitch multiple photos with Ken Burns zoom and TTS voiceovers.' },
    { id: '5', title: 'Video Library Management', duration: '3 min', description: 'Organizing generated drafts, tags, search queries, and files.' },
    { id: '6', title: 'AI Agent Chat', duration: '5 min', description: 'Using the sidebar agent assistant to run tasks and edit properties.' },
    { id: '7', title: 'Content Ideation Engine', duration: '4 min', description: 'Generate concepts, outlines, and script hooks tailored to your niche.' },
    { id: '8', title: 'AI Generation (Thumbnails, Images, B-roll)', duration: '5 min', description: 'Creating visual assets, thumbnails, and custom b-roll elements.' },
    { id: '9', title: 'Script Analyzer - Reverse-Engineer Viral Videos', duration: '5 min', description: 'Paste viral URLs to break down Hooks, triggers, body, and CTA.' },
    { id: '10', title: 'Framework Library - Reusable Templates', duration: '3 min', description: 'Extract reusable writing styles and save them to templates.' },
    { id: '11', title: 'Social Accounts & API Keys', duration: '6 min', description: 'Connecting platforms and adding OpenAI/OpenRouter keys.' },
    { id: '12', title: 'Scheduling & Calendar', duration: '4 min', description: 'Queue up ready posts across direct platform timelines.' },
    { id: '13', title: 'Trend Research', duration: '3 min', description: 'Check popular niche tags and topics to influence generated scripts.' },
    { id: '14', title: 'Analytics Dashboard', duration: '4 min', description: 'Review views, likes, comments engagement, and growth rate metrics.' },
    { id: '15', title: 'Insights Engine', duration: '3 min', description: 'Get automated reports highlighting high-performing themes.' },
    { id: '16', title: 'Auto-Comment Replies', duration: '5 min', description: 'Configure voice profiles and automatically approve suggested comment replies.' },
    { id: '17', title: 'Voice Profile Setup', duration: '3 min', description: 'Train clone voices or select preset styles to customize tone.' },
    { id: '18', title: 'Competitor Monitoring', duration: '4 min', description: 'Track competitive channels and get viral alert notifications.' },
    { id: '19', title: 'Brand Kit', duration: '3 min', description: 'Customize subtitles formatting, progress bars, and rendering profiles.' },
    { id: '20', title: 'Content Repurposing', duration: '4 min', description: 'Turn long-form videos into high-retention short vertical clips.' },
    { id: '21', title: 'Subtitle Translation', duration: '3 min', description: 'Translate video speech overlays into multiple global languages.' },
    { id: '22', title: 'Hook A/B Testing', duration: '3 min', description: 'Test multiple video hook openings to find the best retention rates.' },
    { id: '23', title: 'Multi-Format Publishing', duration: '3 min', description: 'Output videos in 9:16, 16:9, and 1:1 square aspect ratios.' },
  ]

  const filtered = videoGuides.filter(v =>
    v.title.toLowerCase().includes(search.toLowerCase()) ||
    v.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-8">
      {/* Header Banner with Download Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-orange-500/10 to-amber-500/5 p-6 rounded-2xl border border-orange-500/20">
        <div className="space-y-1">
          <h2 className="text-xl font-bold flex items-center gap-2 text-neutral-900 dark:text-white">
            <BookOpen className="size-5 text-orange-500 animate-pulse" />
            <span>Complete Master Guide (Video Scripts &amp; Instructions)</span>
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Download our newly compiled master guide including detailed visual script breakdowns for all 23 videos and instructions for all 20 tabs.
          </p>
        </div>
        <a
          href="/api/download?file=ContentForge-Complete-Guide-v2.docx"
          className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition-all duration-300 shadow-lg hover:shadow-orange-500/20 active:scale-95 shrink-0"
        >
          <FileText className="size-4.5" />
          <span>Download Word Guide (v2)</span>
        </a>
      </div>

      {/* Video Guides Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-2">
            <Video className="size-4" />
            <span>Video Tutorial Directories ({videoGuides.length})</span>
          </h3>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 size-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search tutorials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 h-9 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <p className="text-sm text-neutral-400">No matching tutorials found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((video) => {
              const currentLink = youtubeLinks[video.id] || 'https://youtube.com'
              return (
                <div
                  key={video.id}
                  className="group flex flex-col bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm transition-all hover:shadow-md"
                >
                  {/* Video Thumbnail Placeholder */}
                  <div className="relative aspect-video bg-gradient-to-br from-neutral-800 to-neutral-950 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-orange-600/10 group-hover:bg-orange-600/20 transition-colors" />
                    <a
                      href={currentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="z-10 size-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 text-white shadow-lg transition-transform group-hover:scale-110"
                    >
                      <Play className="size-5 fill-white ml-0.5" />
                    </a>
                    <span className="absolute top-2 left-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded font-mono font-semibold">
                      Video {video.id}
                    </span>
                    <span className="absolute bottom-2 right-2 text-[10px] bg-neutral-900/80 text-white px-2 py-0.5 rounded font-mono">
                      {video.duration}
                    </span>
                  </div>

                  {/* Text Content */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <h4 className="font-semibold text-sm group-hover:text-orange-500 transition-colors line-clamp-1">
                        {video.title}
                      </h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">
                        {video.description}
                      </p>
                    </div>

                    {/* Link Editor */}
                    <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-1">
                      <label className="block text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                        Configure Video Link
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Paste YouTube Link"
                          value={youtubeLinks[video.id] || ''}
                          onChange={(e) => updateLink(video.id, e.target.value)}
                          className="flex-1 px-2.5 h-8 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 focus:outline-none focus:border-orange-500"
                        />
                        <a
                          href={currentLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-8 w-8 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Guide Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Module 1 */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
            <Upload className="size-4.5 text-orange-500" />
            <span>1. Uploading &amp; AI Transcription Workflow</span>
          </h3>
          <ul className="space-y-2.5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">01.</span>
              <span>Drag &amp; drop single or multiple videos/images into the <strong>Upload</strong> section.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">02.</span>
              <span>Wait for the transcribing pipeline to finish. The system automatically transcribes audio, extracts viral tags, and scores it out of 100.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">03.</span>
              <span>Images are automatically processed with the **Ken Burns zoom effect** and coupled with AI voice narration and captions.</span>
            </li>
          </ul>
        </div>

        {/* Module 2 */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
            <Volume2 className="size-4.5 text-orange-500" />
            <span>2. Voice Profiles &amp; Brand Kit Branding</span>
          </h3>
          <ul className="space-y-2.5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">01.</span>
              <span>Go to the <strong>Voice</strong> tab to select from preset voices or link ElevenLabs for high-fidelity custom clones.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">02.</span>
              <span>Use the <strong>Brand Kit</strong> section to define default watermarks, typography settings, progress bars, and rendering color palettes.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">03.</span>
              <span>These branding configs automatically apply whenever a video thumbnail or repurpose job is generated.</span>
            </li>
          </ul>
        </div>

        {/* Module 3 */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
            <Key className="size-4.5 text-orange-500" />
            <span>3. Direct Posting &amp; Scheduler Setup</span>
          </h3>
          <ul className="space-y-2.5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">01.</span>
              <span>Ensure developer keys are updated in the <strong>API Keys</strong> page, and link platforms inside the <strong>Social</strong> tab.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">02.</span>
              <span>Click **Publish** on any processed item in the Library, and choose to post immediately or add to your **Scheduled** queue.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">03.</span>
              <span>The background cron checks once a day (on Vercel Hobby) and publishes due items to TikTok, Instagram Reels, and YouTube Shorts.</span>
            </li>
          </ul>
        </div>

        {/* Module 4 */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
            <Database className="size-4.5 text-orange-500" />
            <span>4. Database &amp; Vercel Maintenance</span>
          </h3>
          <ul className="space-y-2.5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">01.</span>
              <span>Your local SQLite database is kept under `prisma/dev.db`.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">02.</span>
              <span>Vercel build pipelines automatically switch providers to Neon Postgres SQL by running the `prepare-db.js` helper.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-orange-500 font-bold">03.</span>
              <span>If you rotate secrets or Neon endpoints, redeploy the project from the Vercel Dashboard to synchronize database tables.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* FAQ Accordion Section */}
      <div className="space-y-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <HelpCircle className="size-4.5" />
          <span>Frequently Asked Questions</span>
        </h3>

        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          <FAQItem
            question="Why are my uploaded videos stuck in the 'processing' state?"
            answer="Video rendering, subtitle alignment, and audio mixing run in background queues. If you are running locally, verify that your development server is executing and that you have installed FFmpeg. On Vercel, serverless function limits may apply to extremely large files (e.g. over 50MB or longer than 30 seconds)."
          />
          <FAQItem
            question="Can I install this app on my iPhone or Android device?"
            answer="Yes! ContentForge has full Progressive Web App (PWA) support. Open the dashboard URL in Safari (iOS) or Chrome (Android), click the Share/Menu button, and tap 'Add to Home Screen' to launch it in a standalone full-screen window."
          />
          <FAQItem
            question="Why is direct publishing failing for connected social platforms?"
            answer="Direct posting requires active developer tokens. Ensure the credentials and API keys in your 'API Keys' section are fully valid, and confirm that your developer app settings on TikTok or Google Console are in 'Active' or 'Live' mode rather than 'Sandbox/Testing'."
          />
          <FAQItem
            question="How does the 'Viral Score' calculation work?"
            answer="The viral scoring pipeline analyzes the transcript content, hooks density, niche keyword alignment, and trending tags metadata using a semantic scoring model. It returns a score from 1-100, highlighting areas of improvement for visual retention."
          />
          <FAQItem
            question="Where can I add my YouTube video tutorial links?"
            answer="You can paste your links in the input boxes under each video module above. They will save dynamically or you can permanently edit the default links inside the `instructions.tsx` component file."
          />
        </div>
      </div>
    </div>
  )
}
