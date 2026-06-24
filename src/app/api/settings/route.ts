import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const settings = await db.setting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.id] = s.value
  return NextResponse.json({ settings: map })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const updates: { id: string; value: string }[] = body.settings || []
  for (const u of updates) {
    await db.setting.upsert({
      where: { id: u.id },
      create: { id: u.id, value: u.value },
      update: { value: u.value },
    })
  }
  return NextResponse.json({ ok: true })
}
