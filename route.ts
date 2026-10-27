import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/admin';
import { env, supabaseConfigured } from '@/lib/env';
import { safeEqual } from '@/lib/security/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled by Vercel Cron (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
 * Ends lapsed reservations, expires finished ads (which frees their area) and purges old rate-limit rows.
 * Grid statistics are computed live from the tables (grid_stats), so there is no cached counter to refresh.
 * The public grid ALSO filters on expires_at, so a late or missed run never shows an expired ad.
 */
export async function GET(req: Request) {
  if (!env.cronSecret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 503 });
  const auth = req.headers.get('authorization') ?? '';
  if (!safeEqual(auth, `Bearer ${env.cronSecret}`)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const { data, error } = await db().rpc('expire_stale');
  if (error) {
    console.error('[cron] expire_stale failed', error.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}
