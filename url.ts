// Destination-URL validation. Pure checks first (no network), then an optional
// Google Safe Browsing lookup when GOOGLE_SAFE_BROWSING_API_KEY is set.
// This is a first line of defence, not a guarantee: keep "require review" on in Settings
// if you want a human to look at every ad before it goes live.

export class ValidationError extends Error {
  code: string;
  field?: string;
  constructor(code: string, message: string, field?: string) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rebrand.ly', 'ow.ly',
  'shorturl.at', 's.id', 't.ly', 'rb.gy', 'tiny.cc', 'buff.ly', 'lnkd.in', 'bl.ink',
]);

const BAD_SUFFIXES = ['.zip', '.mov', '.local', '.internal', '.localhost', '.lan', '.home', '.corp'];

function isIpLiteral(host: string): boolean {
  if (host.startsWith('[') || host.includes(':')) return true; // IPv6
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host);
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

export function checkTargetUrl(input: string, extraBlocked: string[] = []): URL {
  const raw = (input || '').trim();
  if (!raw || raw.length > 500) {
    throw new ValidationError('URL_INVALID', 'Enter a valid link (max 500 characters).', 'targetUrl');
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ValidationError('URL_INVALID', 'That link is not a valid URL.', 'targetUrl');
  }
  if (u.protocol !== 'https:') {
    throw new ValidationError('URL_NOT_HTTPS', 'The link must start with https://', 'targetUrl');
  }
  if (u.username || u.password) {
    throw new ValidationError('URL_CREDENTIALS', 'Links with a username or password are not allowed.', 'targetUrl');
  }
  if (u.port && u.port !== '443') {
    throw new ValidationError('URL_PORT', 'Custom ports are not allowed.', 'targetUrl');
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host === 'localhost' || isIpLiteral(host)) {
    throw new ValidationError('URL_HOST', 'Use a public domain name, not an IP address or local host.', 'targetUrl');
  }
  if (BAD_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new ValidationError('URL_HOST', 'This domain type is not allowed.', 'targetUrl');
  }
  if (host.split('.').some((label) => label.startsWith('xn--'))) {
    throw new ValidationError(
      'URL_IDN',
      'Internationalised (punycode) domains are not accepted automatically. Contact support to use one.',
      'targetUrl',
    );
  }
  if (SHORTENERS.has(host) || [...SHORTENERS].some((s) => hostMatches(host, s))) {
    throw new ValidationError('URL_SHORTENER', 'Link shorteners are not allowed. Use the final page address.', 'targetUrl');
  }
  if (extraBlocked.some((d) => hostMatches(host, d))) {
    throw new ValidationError('URL_BLOCKED', 'This domain is not allowed by our advertising policy.', 'targetUrl');
  }
  u.hash = '';
  return u;
}

/** Optional reputation check. Fails open on network errors (the ad can still go through human review). */
export async function safeBrowsingIsClean(url: string, apiKey: string): Promise<boolean> {
  if (!apiKey) return true;
  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'pixelnest', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return true;
    const json = (await res.json()) as { matches?: unknown[] };
    return !(json.matches && json.matches.length > 0);
  } catch {
    return true;
  }
}
