'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/auth';
import { providerInfos } from '@/lib/payments';
import { mails } from '@/lib/email';
import { trackingUrl } from '@/lib/security/tokens';
import { cleanText } from '@/lib/security/sanitize';

/**
 * Every action re-checks the caller's role on the server (never trust a hidden button).
 * Money- and state-changing work happens in Postgres functions (atomic + audited); the actions below only
 * validate input, call them and report the result back through ?ok= / ?err= on the page that submitted the form.
 */

const FRIENDLY: Record<string, string> = {
  REASON_REQUIRED: 'A written reason is required (manual activation: at least 20 characters).',
  REFERENCE_REQUIRED: 'A payment reference (at least 3 characters) is required.',
  ORDER_NOT_FOUND: 'Order not found.',
  ORDER_STATE_INVALID: 'That order is not in a state that allows this action.',
  AREA_TAKEN: 'The area is no longer free, so it cannot be activated.',
  AD_NOT_FOUND: 'Ad not found.',
  AD_STATE_INVALID: 'That ad is not in a state that allows this action.',
  ACTION_INVALID: 'Unknown action.',
};

function friendly(message: string): string {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k));
  return key ? FRIENDLY[key] : 'The database rejected this change.';
}

function backPath(fd: FormData): string {
  const b = String(fd.get('back') ?? '');
  return b.startsWith('/admin') && !b.startsWith('//') && !b.includes('\\') ? b : '/admin';
}

/** redirect() throws by design — call it outside any try/catch. */
function finish(fd: FormData, kind: 'ok' | 'err', message: string): never {
  const u = new URL(backPath(fd), 'http://local');
  u.searchParams.delete('ok');
  u.searchParams.delete('err');
  u.searchParams.set(kind, message.slice(0, 200));
  redirect(u.pathname + u.search);
}

async function audit(adminId: string, action: string, targetId: string | null, details: Record<string, unknown>) {
  const { error } = await db().from('admin_logs').insert({ admin_id: adminId, action, target_id: targetId, details });
  if (error) console.error('[admin] audit insert failed', action, error.message);
}

const uuid = z.string().uuid();
const orderNo = z.string().regex(/^PN-[A-Z0-9]{10}$/);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

// ---------------------------------------------------------------- ads

export async function approveAd(fd: FormData) {
  const staff = await requireStaff('moderator');
  const id = uuid.safeParse(str(fd, 'adId'));
  if (!id.success) finish(fd, 'err', 'Invalid ad id.');

  const { data, error } = await db().rpc('approve_ad', { p_ad_id: id.data });
  if (error) finish(fd, 'err', friendly(error.message));
  const r = data as { email: string; order_number: string };
  await audit(staff.id, 'approve_ad', id.data, { order_number: r.order_number });
  void mails.activated(r.email, r.order_number, trackingUrl(r.order_number, 'success'));
  finish(fd, 'ok', 'Ad approved. Its display period started now.');
}

/** action = reject (ad waiting for review) | deactivate (live ad taken down). A reason is mandatory. */
export async function moderateAd(fd: FormData) {
  const staff = await requireStaff('moderator');
  const id = uuid.safeParse(str(fd, 'adId'));
  const action = str(fd, 'action');
  const reason = cleanText(str(fd, 'reason'), 300);
  if (!id.success || !['reject', 'deactivate'].includes(action)) finish(fd, 'err', 'Invalid request.');
  if (reason.length < 5) finish(fd, 'err', 'Write a reason of at least 5 characters (it is sent to the advertiser).');

  const { data, error } = await db().rpc('moderate_ad', { p_ad_id: id.data, p_admin: staff.id, p_action: action, p_reason: reason });
  if (error) finish(fd, 'err', friendly(error.message));
  const r = data as { email: string; order_number: string; title: string };
  void mails.rejected(r.email, r.order_number, r.title, reason, action === 'deactivate');
  finish(fd, 'ok', action === 'reject' ? 'Ad rejected. If it was paid, the order is now marked refund required.' : 'Ad taken down.');
}

// ---------------------------------------------------------------- orders

/** Exceptional, audited. Requires a long reason + an external payment reference. Never writes a payments row. */
export async function manualActivate(fd: FormData) {
  const staff = await requireStaff('admin');
  const no = orderNo.safeParse(str(fd, 'orderNumber'));
  const reason = cleanText(str(fd, 'reason'), 500);
  const reference = cleanText(str(fd, 'reference'), 120);
  if (!no.success) finish(fd, 'err', 'Invalid order number.');

  const { data, error } = await db().rpc('manual_activate_order', {
    p_order_number: no.data, p_admin: staff.id, p_reason: reason, p_reference: reference,
  });
  if (error) finish(fd, 'err', friendly(error.message));
  const r = data as { email: string; order_number: string; result: string };
  void mails.activated(r.email, r.order_number, trackingUrl(r.order_number, 'success'));
  finish(fd, 'ok', `Order ${no.data} activated manually (${r.result}). This was recorded in the activity log.`);
}

export async function markRefunded(fd: FormData) {
  const staff = await requireStaff('admin');
  const no = orderNo.safeParse(str(fd, 'orderNumber'));
  if (!no.success) finish(fd, 'err', 'Invalid order number.');
  const reference = cleanText(str(fd, 'reference'), 120);

  const { error } = await db().rpc('mark_order_refunded', { p_order_number: no.data, p_admin: staff.id, p_reference: reference });
  if (error) finish(fd, 'err', friendly(error.message));
  finish(fd, 'ok', `Order ${no.data} marked as refunded. (Send the money back in the payment provider dashboard.)`);
}

// ---------------------------------------------------------------- packages

const packageSchema = z.object({
  name: z.string().transform((s) => cleanText(s, 60)).refine((s) => s.length >= 2, 'Name is too short'),
  width: z.coerce.number().int().min(1).max(100),
  height: z.coerce.number().int().min(1).max(100),
  price: z.coerce.number().min(0).max(1_000_000_000),
  duration_days: z.coerce.number().int().min(1).max(366),
});

export async function savePackage(fd: FormData) {
  const staff = await requireStaff('admin');
  const id = uuid.safeParse(str(fd, 'id'));
  const parsed = packageSchema.safeParse({
    name: str(fd, 'name'), width: str(fd, 'width'), height: str(fd, 'height'), price: str(fd, 'price'), duration_days: str(fd, 'duration_days'),
  });
  if (!id.success || !parsed.success) finish(fd, 'err', parsed.success ? 'Invalid package.' : (parsed.error.issues[0]?.message ?? 'Invalid package.'));

  const { data: grid } = await db().from('site_settings').select('key,value').in('key', ['grid_width', 'grid_height']);
  const gw = Number(grid?.find((g) => g.key === 'grid_width')?.value ?? 100);
  const gh = Number(grid?.find((g) => g.key === 'grid_height')?.value ?? 100);
  if (parsed.data.width > gw || parsed.data.height > gh) finish(fd, 'err', `A package cannot be larger than the wall (${gw} × ${gh}).`);

  const is_active = fd.get('is_active') === 'on';
  const sb = db();
  const { data: before } = await sb.from('ad_packages').select('name,width,height,price,duration_days,is_active').eq('id', id.data).maybeSingle();
  const { error } = await sb.from('ad_packages').update({ ...parsed.data, is_active }).eq('id', id.data);
  if (error) {
    console.error('[admin] savePackage', error.message);
    finish(fd, 'err', 'Could not save the package.');
  }
  await audit(staff.id, 'update_package', id.data, { before, after: { ...parsed.data, is_active } });
  finish(fd, 'ok', 'Package saved. It applies to new orders only; existing orders keep the price they were created with.');
}

export async function createPackage(fd: FormData) {
  const staff = await requireStaff('admin');
  const slug = z.string().regex(/^[a-z0-9-]{2,40}$/, 'Slug: 2–40 lowercase letters, digits or dashes').safeParse(str(fd, 'slug'));
  const parsed = packageSchema.safeParse({
    name: str(fd, 'name'), width: str(fd, 'width'), height: str(fd, 'height'), price: str(fd, 'price'), duration_days: str(fd, 'duration_days'),
  });
  if (!slug.success) finish(fd, 'err', slug.error.issues[0].message);
  if (!parsed.success) finish(fd, 'err', parsed.error.issues[0]?.message ?? 'Invalid package.');

  const { data, error } = await db()
    .from('ad_packages')
    .insert({ slug: slug.data, ...parsed.data, currency: 'IDR', is_active: false })
    .select('id')
    .single();
  if (error) finish(fd, 'err', error.code === '23505' ? 'That slug already exists.' : 'Could not create the package.');
  await audit(staff.id, 'create_package', data.id, { slug: slug.data, ...parsed.data });
  finish(fd, 'ok', 'Package created as inactive. Review it, then tick "Active" and save.');
}

// ---------------------------------------------------------------- settings / staff

export async function saveSettings(fd: FormData) {
  const staff = await requireStaff('admin');
  const parsed = z
    .object({
      grid_width: z.coerce.number().int().min(20).max(500),
      grid_height: z.coerce.number().int().min(20).max(500),
      reservation_minutes: z.coerce.number().int().min(5).max(1440),
      active_payment_provider: z.enum(['midtrans', 'speedcash']),
    })
    .safeParse({
      grid_width: str(fd, 'grid_width'), grid_height: str(fd, 'grid_height'),
      reservation_minutes: str(fd, 'reservation_minutes'), active_payment_provider: str(fd, 'active_payment_provider'),
    });
  if (!parsed.success) finish(fd, 'err', parsed.error.issues[0]?.message ?? 'Invalid settings.');
  const s = parsed.data;
  const require_review = fd.get('require_review') === 'on';

  const info = providerInfos().find((p) => p.id === s.active_payment_provider);
  if (!info?.configured) finish(fd, 'err', `${info?.label ?? 'That provider'} is not configured, so it cannot be the active provider.`);

  // The wall may never shrink beneath something that is already placed or reserved.
  const sb = db();
  const nowIso = new Date().toISOString();
  const [ads, orders] = await Promise.all([
    sb.from('ads').select('x,y,width,height').in('status', ['active', 'pending_review']).or(`expires_at.is.null,expires_at.gt.${nowIso}`),
    sb.from('orders').select('x,y,width,height').eq('status', 'pending').gt('reservation_expires_at', nowIso),
  ]);
  if (ads.error || orders.error) finish(fd, 'err', 'Could not check existing placements.');
  let needW = 0;
  let needH = 0;
  for (const r of [...(ads.data ?? []), ...(orders.data ?? [])]) {
    needW = Math.max(needW, r.x + r.width);
    needH = Math.max(needH, r.y + r.height);
  }
  const { data: pk } = await sb.from('ad_packages').select('width,height').eq('is_active', true);
  const biggestW = Math.max(0, ...(pk ?? []).map((p) => p.width));
  const biggestH = Math.max(0, ...(pk ?? []).map((p) => p.height));
  if (s.grid_width < needW || s.grid_height < needH) {
    finish(fd, 'err', `The wall cannot be smaller than ${needW} × ${needH}: ads or reservations already occupy that area.`);
  }
  if (s.grid_width < biggestW || s.grid_height < biggestH) {
    finish(fd, 'err', `An active package needs at least ${biggestW} × ${biggestH}. Deactivate or shrink it first.`);
  }

  const rows = [
    { key: 'grid_width', value: s.grid_width },
    { key: 'grid_height', value: s.grid_height },
    { key: 'reservation_minutes', value: s.reservation_minutes },
    { key: 'require_review', value: require_review },
    { key: 'active_payment_provider', value: s.active_payment_provider },
  ].map((r) => ({ ...r, updated_at: nowIso }));
  const { error } = await sb.from('site_settings').upsert(rows, { onConflict: 'key' });
  if (error) {
    console.error('[admin] saveSettings', error.message);
    finish(fd, 'err', 'Could not save settings.');
  }
  await audit(staff.id, 'update_settings', null, { ...s, require_review });
  finish(fd, 'ok', 'Settings saved.');
}

export async function setRole(fd: FormData) {
  const staff = await requireStaff('admin');
  const email = z.string().email().safeParse(str(fd, 'email').trim().toLowerCase());
  const role = z.enum(['user', 'moderator', 'admin']).safeParse(str(fd, 'role'));
  if (!email.success || !role.success) finish(fd, 'err', 'Enter a valid email and role.');

  const sb = db();
  const { data: target } = await sb.from('profiles').select('id,email,role').ilike('email', email.data).maybeSingle();
  if (!target) finish(fd, 'err', 'No account with that email. The person must sign up in Supabase Auth first.');
  if (target.id === staff.id) finish(fd, 'err', 'You cannot change your own role.');

  const { error } = await sb.from('profiles').update({ role: role.data }).eq('id', target.id);
  if (error) finish(fd, 'err', 'Could not change the role.');
  await audit(staff.id, 'set_role', target.id, { email: target.email, from: target.role, to: role.data });
  finish(fd, 'ok', `${target.email} is now ${role.data}.`);
}

// ---------------------------------------------------------------- user reports

export async function handleReport(fd: FormData) {
  const staff = await requireStaff('moderator');
  const id = uuid.safeParse(str(fd, 'reportId'));
  const decision = z.enum(['resolved', 'dismissed']).safeParse(str(fd, 'decision'));
  if (!id.success || !decision.success) finish(fd, 'err', 'Invalid request.');

  const sb = db();
  const { data: rep } = await sb.from('ad_reports').select('id,ad_id,reason,status').eq('id', id.data).maybeSingle();
  if (!rep) finish(fd, 'err', 'Report not found.');
  if (rep.status !== 'open') finish(fd, 'err', 'That report was already handled.');

  let note = '';
  if (decision.data === 'resolved' && fd.get('takedown') === 'on') {
    const reason = cleanText(str(fd, 'reason'), 300) || `Removed after user report (${rep.reason})`;
    const { data, error } = await sb.rpc('moderate_ad', { p_ad_id: rep.ad_id, p_admin: staff.id, p_action: 'deactivate', p_reason: reason });
    if (error) finish(fd, 'err', friendly(error.message));
    const r = data as { email: string; order_number: string; title: string };
    void mails.rejected(r.email, r.order_number, r.title, reason, true);
    note = ' The ad was taken down.';
  }
  const { error } = await sb.from('ad_reports').update({ status: decision.data, handled_by: staff.id }).eq('id', rep.id);
  if (error) finish(fd, 'err', 'Could not update the report.');
  await audit(staff.id, `report_${decision.data}`, rep.id, { ad_id: rep.ad_id, reason: rep.reason, takedown: note !== '' });
  finish(fd, 'ok', `Report ${decision.data}.${note}`);
}
