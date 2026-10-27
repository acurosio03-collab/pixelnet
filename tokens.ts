import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

// Order numbers: PN- + 10 chars from an unambiguous alphabet (unguessable, safe as a provider order_id).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newOrderNumber(): string {
  const bytes = randomBytes(10);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `PN-${s}`;
}

/**
 * Per-order access token (lets a buyer view / renew their own order without an account).
 * Derived with HMAC from the server secret, so we can put a working tracking link in emails
 * while the database only stores a SHA-256 hash of it.
 */
export function makeOrderToken(orderNumber: string): string {
  const secret = env.serviceRoleKey || 'dev-only-insecure-secret';
  return createHmac('sha256', secret).update(`pixelnest/order-token/v1/${orderNumber}`).digest('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function tokenMatches(token: string | null | undefined, storedHash: string): boolean {
  if (!token || token.length > 200) return false;
  return safeEqual(hashToken(token), storedHash);
}

export function trackingUrl(orderNumber: string, view: 'pending' | 'success' = 'pending'): string {
  const t = makeOrderToken(orderNumber);
  return `${env.siteUrl}/payment/${view}?order=${encodeURIComponent(orderNumber)}&t=${t}`;
}
