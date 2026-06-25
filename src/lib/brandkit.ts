import { db } from '@/lib/db'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getDirs, ensureDirs } from '@/lib/storage'

export interface BrandKitData {
  brandName?: string
  logoPath?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  fontFamily?: string
  watermarkPosition?: string
  watermarkOpacity?: number
  watermarkScale?: number
}

export async function getBrandKit(): Promise<BrandKitData | null> {
  const kit = await db.brandKit.findUnique({ where: { id: 'default' } })
  if (!kit) return null
  return {
    brandName: kit.brandName || undefined,
    logoPath: kit.logoPath || undefined,
    primaryColor: kit.primaryColor || undefined,
    secondaryColor: kit.secondaryColor || undefined,
    accentColor: kit.accentColor || undefined,
    fontFamily: kit.fontFamily || undefined,
    watermarkPosition: kit.watermarkPosition || undefined,
    watermarkOpacity: kit.watermarkOpacity || undefined,
    watermarkScale: kit.watermarkScale || undefined,
  }
}

export async function saveBrandKit(data: BrandKitData): Promise<BrandKitData> {
  const kit = await db.brandKit.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      brandName: data.brandName || null,
      logoPath: data.logoPath || null,
      primaryColor: data.primaryColor || null,
      secondaryColor: data.secondaryColor || null,
      accentColor: data.accentColor || null,
      fontFamily: data.fontFamily || null,
      watermarkPosition: data.watermarkPosition || null,
      watermarkOpacity: data.watermarkOpacity || null,
      watermarkScale: data.watermarkScale || null,
    },
    update: {
      brandName: data.brandName || null,
      logoPath: data.logoPath || null,
      primaryColor: data.primaryColor || null,
      secondaryColor: data.secondaryColor || null,
      accentColor: data.accentColor || null,
      fontFamily: data.fontFamily || null,
      watermarkPosition: data.watermarkPosition || null,
      watermarkOpacity: data.watermarkOpacity || null,
      watermarkScale: data.watermarkScale || null,
    },
  })
  return kit as any
}

export async function saveLogo(file: File): Promise<{ logoPath: string }> {
  await ensureDirs()
  const { assets } = getDirs()
  const ext = path.extname(file.name) || '.png'
  const filename = `brandkit_logo_${randomUUID()}${ext}`
  const filepath = path.join(assets, filename)
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(filepath, buffer)
  return { logoPath: filepath }
}
