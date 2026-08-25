import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

// Lazily create the Neon client so importing this module never throws at build
// time (DATABASE_URL may be absent during `next build`). The returned client is
// an HTTP tagged-template function; it also exposes `.query(text, params)` for
// parameterized queries and `.transaction([...])` for atomic multi-statement
// batches. Usage: `const sql = db(); await sql`SELECT 1``.
let cached: NeonQueryFunction<false, false> | undefined;

export function db(): NeonQueryFunction<false, false> {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env.local and fill it in, ' +
          'or connect Neon in the Vercel dashboard and run `vercel env pull .env.local`.',
      );
    }
    cached = neon(url);
  }
  return cached;
}
