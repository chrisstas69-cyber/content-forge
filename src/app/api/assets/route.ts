import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { saveAssetFile } from '@/lib/storage'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null
    const name = formData.get('name') as string | null
    if (!file || !type) {
      return NextResponse.json({ error: 'Missing file or type' }, { status: 400 })
    }
    const saved = await saveAssetFile(file, name || file.name)
    const asset = await db.asset.create({
      data: {
        type,
        name: name || file.name,
        filePath: saved.path,
        mimeType: saved.mimeType,
        sizeBytes: saved.size,
      },
    })
    return NextResponse.json({ asset })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Upload failed' }, { status: 500 })
  }
}

export async function GET() {
  const assets = await db.asset.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ assets })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const asset = await db.asset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try { await import('fs/promises').then(fs => fs.unlink(asset.filePath)) } catch {}
  await db.asset.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
