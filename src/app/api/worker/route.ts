import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const runtime = 'nodejs'

const requestSchema = z.object({
  workerId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  action: z.enum(['claim', 'update']),
  jobId: z.string().uuid().optional(),
  table: z.enum(['content_items', 'processing_jobs']).optional(),
  id: z.string().uuid().optional(),
  values: z.record(z.string(), z.unknown()).optional(),
})
const itemUpdate = z.object({
  status: z.enum(['processing', 'ready', 'queued', 'failed']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  current_step: z.string().max(200).nullable().optional(),
  error_message: z.string().max(4000).nullable().optional(),
  output_path: z.string().optional(),
  thumbnail_path: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  updated_at: z.string().optional(),
}).strict()
const jobUpdate = z.object({
  status: z.enum(['completed', 'queued', 'failed']),
  error_message: z.string().max(4000).nullable().optional(),
  locked_at: z.null().optional(),
  locked_by: z.null().optional(),
  updated_at: z.string().optional(),
}).strict()

export async function POST(request: NextRequest) {
  const token = process.env.CONTENT_WORKER_TOKEN
  if (process.env.VERCEL_ENV !== 'preview' || process.env.TEST_MODE_ENABLED !== 'true' || !token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const provided = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${token}`)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid worker request' }, { status: 400 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Worker database unavailable' }, { status: 503 })
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const input = parsed.data
  if (input.action === 'claim') {
    const { data, error } = await db.rpc('claim_processing_job', { worker_id: input.workerId })
    if (error) return NextResponse.json({ error: 'Could not claim job' }, { status: 503 })
    const job = data?.[0]
    if (!job) return NextResponse.json({ job: null })
    const prefix = `${job.user_id}/${job.workspace_id}/${job.content_item_id}`
    try {
      const sources = await Promise.all((job.source_paths as string[]).map(async path => {
        const { data, error } = await db.storage.from('content-media').createSignedUrl(path, 3600)
        if (error || !data) throw new Error('Could not sign media download')
        return { path, url: data.signedUrl }
      }))
      const uploads = await Promise.all(['output.mp4', 'thumbnail.jpg'].map(async filename => {
        const path = `${prefix}/${filename}`
        const { data, error } = await db.storage.from('content-media').createSignedUploadUrl(path, { upsert: true })
        if (error || !data) throw new Error('Could not sign media upload')
        return { path, url: data.signedUrl }
      }))
      return NextResponse.json({ job, sources, uploads })
    } catch {
      await db.from('processing_jobs').update({ status: 'queued', locked_at: null, locked_by: null }).eq('id', job.job_id)
      return NextResponse.json({ error: 'Could not prepare job media' }, { status: 503 })
    }
  }
  if (!input.jobId || !input.table || !input.id) return NextResponse.json({ error: 'Missing job' }, { status: 400 })
  const { data: job } = await db.from('processing_jobs').select('id, content_item_id, status, locked_by').eq('id', input.jobId).single()
  if (!job || job.locked_by !== input.workerId || job.status !== 'running') {
    return NextResponse.json({ error: 'Job is not owned by this worker' }, { status: 403 })
  }
  if (input.id !== (input.table === 'content_items' ? job.content_item_id : job.id)) {
    return NextResponse.json({ error: 'Job target mismatch' }, { status: 403 })
  }
  const values = (input.table === 'content_items' ? itemUpdate : jobUpdate).safeParse(input.values)
  if (!values.success) return NextResponse.json({ error: 'Invalid job update' }, { status: 400 })
  if (input.table === 'content_items') {
    const { data: item } = await db.from('content_items').select('user_id, workspace_id').eq('id', job.content_item_id).single()
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 })
    const prefix = `${item.user_id}/${item.workspace_id}/${job.content_item_id}`
    const update = values.data as z.infer<typeof itemUpdate>
    if ((update.output_path && update.output_path !== `${prefix}/output.mp4`) || (update.thumbnail_path && update.thumbnail_path !== `${prefix}/thumbnail.jpg`)) {
      return NextResponse.json({ error: 'Invalid output path' }, { status: 400 })
    }
  }
  const { error } = await db.from(input.table).update({ ...values.data, updated_at: new Date().toISOString() }).eq('id', input.id)
  return NextResponse.json(error ? { error: 'Job update failed' } : { ok: true }, { status: error ? 503 : 200 })
}
