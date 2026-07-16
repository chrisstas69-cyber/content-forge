const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const schemaPath = path.join(__dirname, '../prisma/schema.prisma')

function validateDatabaseUrl() {
  const candidates = [process.env.DATABASE_URL, process.env.POSTGRES_DATABASE_URL, process.env.POSTGRES_URL]
  for (const databaseUrl of candidates) {
    if (!databaseUrl) continue
    try {
      const parsed = new URL(databaseUrl)
      if (['postgres:', 'postgresql:'].includes(parsed.protocol) && !parsed.hash) {
        process.env.DATABASE_URL = databaseUrl
        return
      }
    } catch {}
  }
  throw new Error('No valid PostgreSQL database URL is configured.')
}

if (process.env.VERCEL === '1') {
  let legacyDatabaseReady = true
  try {
    validateDatabaseUrl()
  } catch (error) {
    legacyDatabaseReady = false
    if (process.env.RUN_LEGACY_DB_PUSH === 'true') {
      console.error(error.message)
      process.exit(1)
    }
    console.warn(`${error.message} Skipping optional legacy Prisma features; Supabase features will still build.`)
  }

  if (legacyDatabaseReady) {
    console.log('Detected Vercel environment. Preparing the legacy ContentForge schema for PostgreSQL...')

    let schema = fs.readFileSync(schemaPath, 'utf8')
    schema = schema.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"')
    fs.writeFileSync(schemaPath, schema, 'utf8')
    console.log('Updated schema.prisma to use the PostgreSQL provider.')

    if (process.env.RUN_LEGACY_DB_PUSH === 'true') {
      console.log('Running a non-destructive Prisma schema push...')
      try {
        execSync('npx prisma db push', { stdio: 'inherit' })
        console.log('Database synced successfully.')
      } catch (error) {
        console.error('Database sync stopped. Review the Prisma output; destructive changes are not accepted automatically.')
        process.exit(1)
      }
    } else {
      // Even when schema changes are intentionally disabled, the deployed Prisma
      // client must still be generated for PostgreSQL. Otherwise it keeps the
      // checked-in SQLite provider and every legacy DB-backed feature fails.
      console.log('Skipping schema sync and generating the PostgreSQL Prisma client...')
      try {
        execSync('npx prisma generate', { stdio: 'inherit' })
      } catch (error) {
        console.error('Could not generate the PostgreSQL Prisma client.')
        process.exit(1)
      }
    }
  }
} else {
  console.log('Local environment detected. Keeping SQLite.')
}
