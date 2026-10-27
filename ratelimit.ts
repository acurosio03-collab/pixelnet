import 'server-only';
import { db } from '@/lib/supabase/admin';

/** Best-effort client IP (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 64);
  return (headers.get('x-real-ip') || 'unknown').slice(0, 64);
}

/**
 * Fixed-window limiter stored in Postgres (works across serverless instances).
 * Returns true if the request is allowed. If the limiter itself is unreachable it fails OPEN and logs,
 * because the endpoints it protects also need the database and will fail on their own.
 */
export async function allow(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await db().rpc('rate_limit_hit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('[ratelimit] rpc error', error.message);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error('[ratelimit] failure', (e as Error).message);
    return true;
  }
}
