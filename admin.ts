import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let client: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES Row Level Security.
 * Server-only: the `server-only` import makes the build fail if a client component imports this.
 */
export function db(): SupabaseClient {
  if (!client) {
    if (!env.supabaseUrl || !env.serviceRoleKey) {
      throw new Error('SUPABASE_NOT_CONFIGURED');
    }
    client = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
