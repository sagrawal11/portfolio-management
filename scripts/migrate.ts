import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

// Load env for standalone script use (Next.js loads these automatically at
// runtime, but `tsx scripts/migrate.ts` does not). .env.local takes precedence.
config({ path: '.env.local' });
config();

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set (see .env.example)');
  const sql = neon(url);

  const schema = readFileSync(join(here, '..', 'lib', 'schema.sql'), 'utf8');

  // Strip line comments FIRST (a comment may contain a `;`), then split on `;`.
  // Our schema has no semicolons inside statement bodies or string literals.
  const statements = schema
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`Applying ${statements.length} statements...`);
  for (const stmt of statements) {
    await sql.query(stmt);
    console.log(`  ✓ ${stmt.replace(/\s+/g, ' ').slice(0, 64)}…`);
  }
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
