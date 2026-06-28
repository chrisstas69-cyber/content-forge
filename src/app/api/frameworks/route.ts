import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getFrameworks } from '@/lib/script-analysis'

export const runtime = 'nodejs'

// GET: list saved frameworks
export async function GET() {
  const frameworks = await getFrameworks()
  return NextResponse.json({ frameworks })
}

// DELETE: remove a framework
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await db.framework.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
