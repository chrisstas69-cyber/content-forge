import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SECRET_FIELDS, PLATFORM_GROUPS, listSecrets, setSecret } from '@/lib/secrets'

export const runtime = 'nodejs'

// GET: list all known secret fields with their status (configured or not, masked preview)
export async function GET() {
  const stored = await listSecrets()
  const storedMap = new Map(stored.map(s => [s.id, s]))

  const fields = SECRET_FIELDS.map(f => {
    const s = storedMap.get(f.id)
    return {
      id: f.id,
      label: f.label,
      platform: f.platform,
      required: f.required,
      placeholder: f.placeholder,
      helpUrl: f.helpUrl,
      hasValue: s?.hasValue || false,
      preview: s?.preview || '',
      updatedAt: s?.updatedAt || null,
    }
  })

  // Group by platform and compute "configured" status
  const groups = PLATFORM_GROUPS.map(g => {
    const platformFields = fields.filter(f => f.platform === g.id)
    const required = platformFields.filter(f => f.required)
    const configured = required.every(f => f.hasValue)
    return {
      ...g,
      configured,
      fields: platformFields,
    }
  })

  return NextResponse.json({ groups })
}

// POST: bulk save secrets. Body: { secrets: [{ id, value, label, platform }] }
// Empty values are ignored (not cleared). To clear, use DELETE.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const secrets: { id: string; value: string; label: string; platform: string }[] = body.secrets || []
  let saved = 0
  for (const s of secrets) {
    if (!s.id || !s.value || !s.platform || !s.label) continue
    await setSecret(s.id, s.value, s.label, s.platform)
    saved++
  }
  return NextResponse.json({ ok: true, saved })
}
