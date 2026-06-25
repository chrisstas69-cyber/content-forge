import { db } from '@/lib/db'
import crypto from 'crypto'

// We use a single master key from the ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
// On Vercel, the user sets this once in Project Settings → Environment Variables.
// All API secrets are encrypted with AES-256-GCM and stored in the AppSecret table.

function getMasterKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    // Auto-generate a stable key from a default source so the app still runs in dev
    // without forcing the user to set ENCRYPTION_KEY. NOT for production use.
    if (process.env.NODE_ENV !== 'production') {
      // Derive a deterministic dev key from a fixed string
      return crypto.createHash('sha256').update('dev-only-encryption-key-DO-NOT-USE-IN-PROD').digest()
    }
    throw new Error('ENCRYPTION_KEY env var must be set to a 64-char hex string (32 bytes). Generate one with: openssl rand -hex 32')
  }
  return Buffer.from(keyHex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getMasterKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(12) || tag(16) || ciphertext  → base64
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decrypt(payload: string): string {
  const key = getMasterKey()
  const buf = Buffer.from(payload, 'base64')
  if (buf.length < 28) throw new Error('Invalid ciphertext')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

export function mask(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '•'.repeat(value.length)
  return value.slice(0, 4) + '•'.repeat(Math.max(4, value.length - 8)) + value.slice(-4)
}

// ---- Secret schema definitions ----
// Each platform has a set of required credentials.
export interface SecretField {
  id: string           // e.g. "youtube.client_id"
  label: string        // e.g. "Client ID"
  platform: string
  required: boolean
  placeholder?: string
  helpUrl?: string
}

export const SECRET_FIELDS: SecretField[] = [
  // YouTube / Google
  { id: 'youtube.client_id', label: 'Client ID', platform: 'youtube', required: true, placeholder: 'xxxxx.apps.googleusercontent.com', helpUrl: 'https://console.cloud.google.com/apis/credentials' },
  { id: 'youtube.client_secret', label: 'Client Secret', platform: 'youtube', required: true, placeholder: 'GOCSPX-xxxxx' },
  // TikTok
  { id: 'tiktok.client_key', label: 'Client Key', platform: 'tiktok', required: true, helpUrl: 'https://developers.tiktok.com/app/quickstart' },
  { id: 'tiktok.client_secret', label: 'Client Secret', platform: 'tiktok', required: true },
  // Meta (Instagram + Facebook share the same app)
  { id: 'meta.app_id', label: 'App ID', platform: 'meta', required: true, helpUrl: 'https://developers.facebook.com/apps/' },
  { id: 'meta.app_secret', label: 'App Secret', platform: 'meta', required: true },
  // X (Twitter)
  { id: 'x.client_id', label: 'Client ID', platform: 'x', required: true, helpUrl: 'https://developer.twitter.com/en/portal/dashboard' },
  { id: 'x.client_secret', label: 'Client Secret', platform: 'x', required: true },
]

export const PLATFORM_GROUPS: { id: string; label: string; description: string; helpUrl?: string }[] = [
  { id: 'youtube', label: 'YouTube', description: 'Google Cloud Project with YouTube Data API v3 enabled', helpUrl: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com' },
  { id: 'tiktok', label: 'TikTok', description: 'TikTok Developers app with video.upload + video.publish scopes', helpUrl: 'https://developers.tiktok.com/app/quickstart' },
  { id: 'meta', label: 'Instagram + Facebook', description: 'One Meta app powers both Instagram and Facebook publishing', helpUrl: 'https://developers.facebook.com/apps/' },
  { id: 'x', label: 'X (Twitter)', description: 'Twitter Developer Portal project with OAuth 2.0', helpUrl: 'https://developer.twitter.com/en/portal/dashboard' },
]

// ---- DB-backed secret accessors ----
// Returns the decrypted secret value, or undefined if not set.
// Falls back to process.env for backwards compatibility (so users can still use .env if they prefer).
export async function getSecret(id: string): Promise<string | undefined> {
  const row = await db.appSecret.findUnique({ where: { id } })
  if (row) {
    try {
      return decrypt(row.cipherText)
    } catch (err) {
      console.error(`Failed to decrypt secret ${id}:`, err)
    }
  }
  // Fallback: read from process.env (snake_case version of the id)
  const envKey = id.toUpperCase().replace(/\./g, '_')
  return process.env[envKey]
}

export async function setSecret(id: string, value: string, label: string, platform: string): Promise<void> {
  if (!value) {
    await db.appSecret.delete({ where: { id } }).catch(() => {})
    return
  }
  const cipherText = encrypt(value)
  await db.appSecret.upsert({
    where: { id },
    create: { id, label, platform, cipherText },
    update: { label, platform, cipherText },
  })
}

export async function deleteSecret(id: string): Promise<void> {
  await db.appSecret.delete({ where: { id } }).catch(() => {})
}

export async function listSecrets(): Promise<{ id: string; label: string; platform: string; hasValue: boolean; preview: string; updatedAt: Date }[]> {
  const rows = await db.appSecret.findMany()
  return rows.map(r => {
    let value = ''
    try { value = decrypt(r.cipherText) } catch {}
    return {
      id: r.id,
      label: r.label,
      platform: r.platform,
      hasValue: !!value,
      preview: mask(value),
      updatedAt: r.updatedAt,
    }
  })
}

export async function isPlatformConfigured(platform: string): Promise<boolean> {
  const fields = SECRET_FIELDS.filter(f => f.platform === platform && f.required)
  for (const f of fields) {
    const v = await getSecret(f.id)
    if (!v) return false
  }
  return true
}
