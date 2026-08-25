import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let configured = false;
  try {
    const rows = await db()`SELECT 1 FROM portfolio_config WHERE id = 1`;
    configured = rows.length > 0;
  } catch {
    configured = false;
  }
  redirect(configured ? '/dashboard' : '/setup');
}
