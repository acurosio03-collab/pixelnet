import 'server-only';
import { db } from '@/lib/supabase/admin';
import { adImageUrl, supabaseConfigured } from '@/lib/env';
import { pickDefault, providerInfos } from '@/lib/payments';
import type { GridPayload, PublicAd, PublicPackage } from '@/lib/types';

const DEMO_PACKAGES: PublicPackage[] = [
  { id: 'demo-starter', slug: 'starter', name: 'Starter', width: 5, height: 5, price: 25000, currency: 'IDR', durationDays: 30 },
  { id: 'demo-business', slug: 'business', name: 'Business', width: 10, height: 10, price: 75000, currency: 'IDR', durationDays: 30 },
  { id: 'demo-premium', slug: 'premium', name: 'Premium', width: 15, height: 15, price: 200000, currency: 'IDR', durationDays: 30 },
];

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

// Clearly labelled sample ads, shown ONLY while Supabase is not configured.
const DEMO_ADS: PublicAd[] = [
  ['Sample Brand A', 6, 6, 15, 15, 'Premium', 200000],
  ['Sample Brand B', 28, 4, 10, 10, 'Business', 75000],
  ['Sample Brand C', 44, 20, 10, 10, 'Business', 75000],
  ['Sample Brand D', 12, 30, 5, 5, 'Starter', 25000],
  ['Sample Brand E', 62, 8, 15, 15, 'Premium', 200000],
  ['Sample Brand F', 22, 52, 10, 10, 'Business', 75000],
  ['Sample Brand G', 70, 44, 5, 5, 'Starter', 25000],
  ['Sample Brand H', 48, 62, 15, 15, 'Premium', 200000],
].map(([name, x, y, w, h, pkg, price], i) => ({
  id: `demo-${i}`,
  x: x as number,
  y: y as number,
  width: w as number,
  height: h as number,
  title: `${name} (demo)`,
  advertiser: name as string,
  description: 'Demo placeholder. Real ads appear once the database is connected.',
  imageUrl: null,
  targetUrl: 'https://example.com',
  startsAt: inDays(-3),
  expiresAt: inDays(20 + i),
  packageName: pkg as string,
  price: price as number,
  currency: 'IDR',
  demo: true,
}));

function emptyStats(total: number) {
  return { soldUnits: 0, activeAds: 0, advertisers: 0, totalUnits: total, percent: 0 };
}

export async function loadGrid(): Promise<GridPayload> {
  const providers = providerInfos();
  const defaultProvider = pickDefault(undefined);

  if (!supabaseConfigured()) {
    const sold = DEMO_ADS.reduce((n, a) => n + a.width * a.height, 0);
    return {
      demo: true,
      grid: { width: 100, height: 100 },
      ads: DEMO_ADS,
      reserved: [],
      expired: [],
      stats: { soldUnits: sold, activeAds: DEMO_ADS.length, advertisers: DEMO_ADS.length, totalUnits: 10000, percent: (sold / 10000) * 100 },
      packages: DEMO_PACKAGES,
      providers,
      defaultProvider,
      reservationMinutes: 30,
    };
  }

  try {
    const sb = db();
    const nowIso = new Date().toISOString();
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

    const [settings, pkgs, ads, reserved, expired, stats] = await Promise.all([
      sb.from('site_settings').select('key,value'),
      sb.from('ad_packages').select('id,slug,name,width,height,price,currency,duration_days').eq('is_active', true).order('price'),
      sb
        .from('ads')
        .select('id,x,y,width,height,title,advertiser_name,description,image_path,target_url,starts_at,expires_at,orders(amount,currency,ad_packages(name))')
        .eq('status', 'active')
        .gt('expires_at', nowIso)
        .limit(2000),
      sb
        .from('orders')
        .select('x,y,width,height,reservation_expires_at')
        .eq('status', 'pending')
        .eq('order_type', 'new')
        .gt('reservation_expires_at', nowIso)
        .limit(2000),
      sb
        .from('ads')
        .select('x,y,width,height,advertiser_name')
        .or(`status.eq.expired,and(status.eq.active,expires_at.lte.${nowIso})`)
        .gt('expires_at', since)
        .limit(300),
      sb.rpc('grid_stats'),
    ]);

    for (const r of [settings, pkgs, ads, reserved, expired, stats]) {
      if (r.error) throw new Error(r.error.message);
    }

    const cfg: Record<string, unknown> = {};
    for (const row of settings.data ?? []) cfg[row.key] = row.value;
    const gw = Number(cfg.grid_width ?? 100);
    const gh = Number(cfg.grid_height ?? 100);

    const st = (stats.data ?? {}) as { sold_units?: number; active_ads?: number; advertisers?: number; total_units?: number };
    const total = Number(st.total_units ?? gw * gh) || gw * gh;
    const sold = Number(st.sold_units ?? 0);

    type AdRow = {
      id: string; x: number; y: number; width: number; height: number; title: string; advertiser_name: string;
      description: string | null; image_path: string; target_url: string; starts_at: string | null; expires_at: string | null;
      orders?: { amount: number; currency: string; ad_packages?: { name: string } | { name: string }[] | null } | { amount: number; currency: string; ad_packages?: unknown }[] | null;
    };

    const publicAds: PublicAd[] = ((ads.data ?? []) as unknown as AdRow[]).map((a) => {
      const o = Array.isArray(a.orders) ? a.orders[0] : a.orders;
      const pk = o?.ad_packages as { name: string } | { name: string }[] | null | undefined;
      const pkName = Array.isArray(pk) ? pk[0]?.name : pk?.name;
      return {
        id: a.id, x: a.x, y: a.y, width: a.width, height: a.height,
        title: a.title, advertiser: a.advertiser_name, description: a.description,
        imageUrl: adImageUrl(a.image_path), targetUrl: a.target_url,
        startsAt: a.starts_at, expiresAt: a.expires_at,
        packageName: pkName ?? null, price: o ? Number(o.amount) : null, currency: o?.currency ?? null,
      };
    });

    return {
      demo: false,
      grid: { width: gw, height: gh },
      ads: publicAds,
      reserved: (reserved.data ?? []).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height, expiresAt: r.reservation_expires_at })),
      expired: (expired.data ?? []).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height, advertiser: r.advertiser_name })),
      stats: {
        soldUnits: sold,
        activeAds: Number(st.active_ads ?? publicAds.length),
        advertisers: Number(st.advertisers ?? 0),
        totalUnits: total,
        percent: total ? Math.min(100, (sold / total) * 100) : 0,
      },
      packages: (pkgs.data ?? []).map((p) => ({
        id: p.id, slug: p.slug, name: p.name, width: p.width, height: p.height,
        price: Number(p.price), currency: p.currency, durationDays: p.duration_days,
      })),
      providers,
      defaultProvider: pickDefault(typeof cfg.active_payment_provider === 'string' ? cfg.active_payment_provider : undefined),
      reservationMinutes: Number(cfg.reservation_minutes ?? 30),
    };
  } catch (e) {
    console.error('[grid] load failed', (e as Error).message);
    return {
      demo: false,
      grid: { width: 100, height: 100 },
      ads: [], reserved: [], expired: [],
      stats: emptyStats(10000),
      packages: DEMO_PACKAGES.map((p) => ({ ...p, id: p.slug })),
      providers, defaultProvider,
      reservationMinutes: 30,
      error: 'Live data is temporarily unavailable.',
    };
  }
}
