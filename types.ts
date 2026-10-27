// Shapes shared between the public API and the UI.

export interface PublicAd {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  advertiser: string;
  description: string | null;
  imageUrl: string | null; // null only for demo data
  targetUrl: string;
  startsAt: string | null;
  expiresAt: string | null;
  packageName: string | null;
  price: number | null;
  currency: string | null;
  demo?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PublicPackage {
  id: string;
  slug: string;
  name: string;
  width: number;
  height: number;
  price: number;
  currency: string;
  durationDays: number;
}

export interface ProviderInfo {
  id: 'speedcash' | 'midtrans';
  label: string;
  configured: boolean;
  note?: string;
}

export interface GridPayload {
  demo: boolean;
  grid: { width: number; height: number };
  ads: PublicAd[];
  reserved: (Rect & { expiresAt: string })[];
  expired: (Rect & { advertiser: string })[];
  stats: { soldUnits: number; activeAds: number; advertisers: number; totalUnits: number; percent: number };
  packages: PublicPackage[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo['id'];
  reservationMinutes: number;
  /** Set when the database is configured but a query failed. The UI must say so instead of faking data. */
  error?: string;
}
