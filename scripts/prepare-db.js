const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');

if (process.env.VERCEL === '1') {
  if (process.env.RUN_LEGACY_DB_PUSH !== 'true') {
    console.log('Skipping legacy Prisma database sync. Set RUN_LEGACY_DB_PUSH=true only for an intentional migration deployment.');
    process.exit(0);
  }
  console.log('Detected Vercel environment. Preparing database for PostgreSQL...');
  
  let schema = fs.readFileSync(schemaPath, 'utf8');
  
  // Replace sqlite with postgresql
  schema = schema.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
  
  fs.writeFileSync(schemaPath, schema, 'utf8');
  console.log('Updated schema.prisma to use postgresql provider.');
  
  // Generate client and push db
  console.log('Running prisma db push to sync database schema...');
  try {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('Database synced successfully.');
  } catch (err) {
    console.error('Failed to push database schema:', err);
    process.exit(1);
  }
} else {
  console.log('Local environment detected. Keeping SQLite.');
}
