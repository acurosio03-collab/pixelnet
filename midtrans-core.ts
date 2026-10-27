// Pure Midtrans helpers (no env, no network) so they can be unit-tested without a build.
import { createHash } from 'node:crypto';
import type { NormalizedStatus } from './types';

export function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

export function midtransSignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string): string {
  return createHash('sha512').update(orderId + statusCode + grossAmount + serverKey).digest('hex');
}

export function normalizeMidtransStatus(raw: Record<string, unknown>): NormalizedStatus {
  const ts = str(raw.transaction_status).toLowerCase();
  const fraud = str(raw.fraud_status).toLowerCase();
  const code = str(raw.status_code);
  switch (ts) {
    case 'settlement':
      return code === '200' ? 'paid' : 'pending';
    case 'capture':
      return code === '200' && (fraud === 'accept' || fraud === '') ? 'paid' : 'pending'; // fraud "challenge" stays pending
    case 'pending':
    case 'authorize':
      return 'pending';
    case 'deny':
    case 'cancel':
    case 'failure':
      return 'failed';
    case 'expire':
      return 'expired';
    case 'refund':
    case 'chargeback':
      return 'refunded';
    default:
      // partial_refund, partial_chargeback and anything new: logged, never auto-acted on.
      return 'unknown';
  }
}
