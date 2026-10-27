// Central, lazy access to environment variables.
// Secrets are only read here on the server. Never import this file from a client component.

export const env = {
  get siteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  },
  get contactEmail() {
    return process.env.NEXT_PUBLIC_CONTACT_EMAIL || '';
  },
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  },
  get supabaseAnonKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  },
  get serviceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  },
  get cronSecret() {
    return process.env.CRON_SECRET || '';
  },
  get midtransServerKey() {
    return process.env.MIDTRANS_SERVER_KEY || '';
  },
  get midtransClientKey() {
    return process.env.MIDTRANS_CLIENT_KEY || '';
  },
  get midtransIsProduction() {
    return (process.env.MIDTRANS_IS_PRODUCTION || 'false').toLowerCase() === 'true';
  },
  get speedcashApiKey() {
    return process.env.SPEEDCASH_API_KEY || '';
  },
  get speedcashApiSecret() {
    return process.env.SPEEDCASH_API_SECRET || '';
  },
  get speedcashBaseUrl() {
    return process.env.SPEEDCASH_BASE_URL || '';
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY || '';
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || 'PIXELNEST <noreply@example.com>';
  },
  get safeBrowsingKey() {
    return process.env.GOOGLE_SAFE_BROWSING_API_KEY || '';
  },
  get blockedDomains(): string[] {
    return (process.env.BLOCKED_DOMAINS || '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  },
};

export function supabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey && env.serviceRoleKey);
}

export function adImageUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/ad-images/${path}`;
}
