import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads')
const ORIGINALS_DIR = path.join(UPLOAD_ROOT, 'originals')
const PROCESSED_DIR = path.join(UPLOAD_ROOT, 'processed')
const THUMBNAILS_DIR = path.join(UPLOAD_ROOT, 'thumbnails')
const ASSETS_DIR = path.join(UPLOAD_ROOT, 'assets')

export async function ensureDirs() {
  await Promise.all([
    fs.mkdir(ORIGINALS_DIR, { recursive: true }),
    fs.mkdir(PROCESSED_DIR, { recursive: true }),
    fs.mkdir(THUMBNAILS_DIR, { recursive: true }),
    fs.mkdir(ASSETS_DIR, { recursive: true }),
  ])
}

export function getDirs() {
  return {
    uploadRoot: UPLOAD_ROOT,
    originals: ORIGINALS_DIR,
    processed: PROCESSED_DIR,
    thumbnails: THUMBNAILS_DIR,
    assets: ASSETS_DIR,
  }
}

export async function saveUploadedFile(
  file: File | Blob,
  originalName: string,
): Promise<{ path: string; size: number; mimeType: string }> {
  await ensureDirs()
  const ext = path.extname(originalName) || '.mp4'
  const id = randomUUID()
  const filename = `${id}${ext}`
  const filePath = path.join(ORIGINALS_DIR, filename)
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(filePath, buffer)
  return {
    path: filePath,
    size: buffer.length,
    mimeType: file.type || 'video/mp4',
  }
}

export async function saveAssetFile(
  file: File | Blob,
  originalName: string,
): Promise<{ id: string; path: string; size: number; mimeType: string }> {
  await ensureDirs()
  const id = randomUUID()
  const ext = path.extname(originalName) || ''
  const filename = `${id}${ext}`
  const filePath = path.join(ASSETS_DIR, filename)
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(filePath, buffer)
  return {
    id,
    path: filePath,
    size: buffer.length,
    mimeType: file.type || 'application/octet-stream',
  }
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function deleteFile(p: string): Promise<void> {
  try {
    await fs.unlink(p)
  } catch {}
}
