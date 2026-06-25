import { NextRequest } from 'next/server'
import { subscribe } from '@/lib/event-bus'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (event: string, data: any) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Initial hello
      send('hello', { message: 'connected', timestamp: Date.now() })

      // Send initial snapshot of recent videos
      const videos = await db.video.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
      send('snapshot', { videos: videos.map(v => ({
        id: v.id,
        status: v.status,
        progress: v.progress,
        currentStep: v.currentStep,
        viralScore: v.viralScore,
      })) })

      const unsub = subscribe((event) => {
        send(event.type, event)
      })

      // Keepalive
      const keepalive = setInterval(() => {
        try { send('ping', { timestamp: Date.now() }) } catch {}
      }, 25000)

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        clearInterval(keepalive)
        unsub()
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
