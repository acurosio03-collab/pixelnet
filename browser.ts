'use client';
import { createBrowserClient } from '@supabase/ssr';

// Uses ONLY the public anon key. Everything sensitive is enforced by RLS + server routes.
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
