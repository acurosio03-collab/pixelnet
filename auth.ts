import 'server-only';
import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';
import { db } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/env';

export type Role = 'user' | 'moderator' | 'admin';
export interface Staff {
  id: string;
  email: string;
  role: Role;
}

/** Returns the signed-in staff member, or null. Role is read from the database, never from the client. */
export async function getStaff(): Promise<Staff | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await db()
    .from('profiles')
    .select('id,email,role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile || !['admin', 'moderator'].includes(profile.role)) return null;
  return profile as Staff;
}

/** Use at the top of every admin page and server action. */
export async function requireStaff(min: 'moderator' | 'admin' = 'moderator'): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect('/login?error=forbidden');
  if (min === 'admin' && staff.role !== 'admin') redirect('/admin?error=admin_only');
  return staff;
}
