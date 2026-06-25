import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBrandKit, saveBrandKit, saveLogo } from '@/lib/brandkit'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'

export async function GET() {
  const kit = await getBrandKit()
  return NextResponse.json({
    brandKit: kit ? {
      ...kit,
      logoUrl: kit.logoPath ? '/api/brandkit/logo' : null,
    } : null,
  })
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''
  let data
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('logo') as File | null
    let logoPath: string | undefined
    if (file) {
      const result = await saveLogo(file)
      logoPath = result.logoPath
    }
    data = {
      brandName: (formData.get('brandName') as string) || undefined,
      primaryColor: (formData.get('primaryColor') as string) || undefined,
      secondaryColor: (formData.get('secondaryColor') as string) || undefined,
      accentColor: (formData.get('accentColor') as string) || undefined,
      fontFamily: (formData.get('fontFamily') as string) || undefined,
      watermarkPosition: (formData.get('watermarkPosition') as string) || undefined,
      watermarkOpacity: formData.get('watermarkOpacity') ? parseFloat(formData.get('watermarkOpacity') as string) : undefined,
      watermarkScale: formData.get('watermarkScale') ? parseFloat(formData.get('watermarkScale') as string) : undefined,
      logoPath,
    }
    // If no new logo uploaded, keep the existing one
    if (!logoPath) {
      const existing = await getBrandKit()
      data.logoPath = existing?.logoPath
    }
  } else {
    data = await req.json()
  }
  const kit = await saveBrandKit(data)
  return NextResponse.json({ brandKit: kit })
}

export async function DELETE() {
  await db.brandKit.delete({ where: { id: 'default' } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
