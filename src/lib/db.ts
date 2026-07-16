import { PrismaClient } from '@prisma/client'

// Vercel's Neon integration exposes POSTGRES_DATABASE_URL. Prefer it whenever
// the manually entered DATABASE_URL is missing or malformed.
const configuredDatabaseUrl = [
  process.env.DATABASE_URL,
  process.env.POSTGRES_DATABASE_URL,
  process.env.POSTGRES_URL,
].find(value => {
  if (!value) return false
  try {
    return ['postgres:', 'postgresql:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
})
if (configuredDatabaseUrl) process.env.DATABASE_URL = configuredDatabaseUrl

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
