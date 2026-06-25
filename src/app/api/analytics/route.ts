import { NextRequest, NextResponse } from 'next/server'
import { getAnalyticsSummary } from '@/lib/analytics'

export const runtime = 'nodejs'

export async function GET() {
  const summary = await getAnalyticsSummary()
  return NextResponse.json(summary)
}
