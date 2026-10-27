// Text sanitising + a small blocklist for clearly prohibited advertising categories.
// React escapes output, so this is defence in depth (emails, admin tables, exports).

// zero-width, bidi-override and other invisible/control characters
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function cleanText(input: unknown, max: number): string {
  const s = typeof input === 'string' ? input : '';
  return s
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Basic screening only (Indonesian + English). The Advertising Policy page lists everything that is
// prohibited; human review (Settings -> require review) is the real safeguard.
const BLOCKED_TERMS = [
  'judi online', 'judi bola', 'slot gacor', 'slot online', 'situs slot', 'togel', 'casino online', 'online casino',
  'sports betting', 'bandar judi', 'pinjol ilegal', 'narkoba', 'jual sabu', 'jual ganja', 'buy cocaine',
  'bokep', 'porn', 'xxx video', 'escort service', 'open bo', 'carding', 'jasa hack', 'hack facebook',
  'hack instagram', 'phishing', 'jual akun curian', 'uang palsu', 'fake id', 'counterfeit', 'ponzi',
  'investasi bodong', 'arisan online cepat kaya',
];

export function findBlockedTerm(...texts: string[]): string | null {
  const hay = texts.join(' \n ').toLowerCase();
  for (const term of BLOCKED_TERMS) {
    const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
    if (re.test(hay)) return term;
  }
  return null;
}

export function isValidEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(s);
}
