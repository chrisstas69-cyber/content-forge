import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file') || 'ContentForge-Complete-Guide-v2.docx'
  const filepath = path.join(process.cwd(), 'download', file)

  try {
    const buffer = await fs.readFile(filepath)
    const filename = path.basename(filepath)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
