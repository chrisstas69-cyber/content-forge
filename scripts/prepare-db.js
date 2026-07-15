const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const schemaPath = path.join(__dirname, '../prisma/schema.prisma')

function validateDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing.')
  }

  let parsed
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL.')
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol.')
  }

  if (parsed.hash) {
    throw new Error('DATABASE_URL contains an unescaped # character. URL-encode reserved password characters before redeploying.')
  }
}

if (process.env.VERCEL === '1') {
  if (process.env.RUN_LEGACY_DB_PUSH !== 'true') {
    console.log('Skipping legacy Prisma schema sync. The dashboard and upload APIs require the legacy tables.')
    console.log('For one intentional Preview deployment, set RUN_LEGACY_DB_PUSH=true, review the build, then remove the flag.')
    process.exit(0)
  }

  try {
    validateDatabaseUrl()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }

  console.log('Detected Vercel environment. Preparing the legacy ContentForge schema for PostgreSQL...')

  let schema = fs.readFileSync(schemaPath, 'utf8')
  schema = schema.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"')
  fs.writeFileSync(schemaPath, schema, 'utf8')
  console.log('Updated schema.prisma to use the PostgreSQL provider.')

  console.log('Running a non-destructive Prisma schema push...')
  try {
    execSync('npx prisma db push', { stdio: 'inherit' })
    console.log('Database synced successfully.')
  } catch (error) {
    console.error('Database sync stopped. Review the Prisma output; destructive changes are not accepted automatically.')
    process.exit(1)
  }
} else {
  console.log('Local environment detected. Keeping SQLite.')
}
