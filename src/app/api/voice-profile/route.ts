import { NextRequest, NextResponse } from 'next/server'
import { getVoiceProfile, saveVoiceProfile } from '@/lib/comments'

export const runtime = 'nodejs'

export async function GET() {
  const vp = await getVoiceProfile()
  return NextResponse.json({ voiceProfile: vp })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const vp = await saveVoiceProfile(body)
  return NextResponse.json({ voiceProfile: vp })
}
