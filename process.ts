import 'server-only';
import { db } from '@/lib/supabase/admin';
import { mails } from '@/lib/email';
import { trackingUrl } from '@/lib/security/tokens';
import type { ProviderId, TransactionState } from './types';

export interface ProcessOutcome {
  result: string;
  /** false => something went wrong that the provider should retry (respond 5xx). */
  ok: boolean;
}

/**
 * Applies a provider-CONFIRMED transaction state to the database.
 * All money-affecting logic is inside Postgres functions that run in one transaction under an advisory lock,
 * deduplicate by (provider, event_id), and compare amount + currency with the stored order.
 */
export async function applyTransactionState(provider: ProviderId, s: TransactionState): Promise<ProcessOutcome> {
  if (!s.orderNumber) return { result: 'no_order', ok: true };

  if (s.status === 'unknown') {
    // Unrecognised provider status: keep an audit trail but change nothing.
    await db().from('payment_events').upsert(
      { provider, event_id: s.eventId, processing_status: `ignored_${s.rawStatus || 'unknown'}`.slice(0, 80) },
      { onConflict: 'provider,event_id', ignoreDuplicates: true },
    );
    return { result: 'ignored', ok: true };
  }

  if (!Number.isFinite(s.amount)) return { result: 'bad_amount', ok: true };

  if (s.status === 'paid') {
    const { data, error } = await db().rpc('activate_paid_order', {
      p_provider: provider,
      p_event_id: s.eventId,
      p_order_number: s.orderNumber,
      p_provider_tx: s.providerTransactionId,
      p_amount: s.amount,
      p_currency: s.currency,
      p_raw_status: s.rawStatus,
    });
    if (error) {
      console.error('[payments] activate_paid_order failed', error.message);
      return { result: 'db_error', ok: false };
    }
    const r = data as { result: string; email?: string; order_number?: string };
    if (r.email && r.order_number) {
      const url = trackingUrl(r.order_number, 'success');
      if (r.result === 'activated') void mails.activated(r.email, r.order_number, url);
      else if (r.result === 'pending_review') void mails.pendingReview(r.email, r.order_number, url);
      else if (r.result === 'renewed') void mails.renewed(r.email, r.order_number, url);
      else if (r.result === 'refund_required') void mails.refundRequired(r.email, r.order_number);
    }
    if (['amount_mismatch', 'provider_mismatch', 'order_not_found'].includes(r.result)) {
      console.error('[payments] SUSPICIOUS paid event', { provider, order: s.orderNumber, result: r.result });
    }
    return { result: r.result, ok: true };
  }

  const { data, error } = await db().rpc('record_payment_status', {
    p_provider: provider,
    p_event_id: s.eventId,
    p_order_number: s.orderNumber,
    p_provider_tx: s.providerTransactionId,
    p_amount: s.amount,
    p_currency: s.currency,
    p_status: s.status,
    p_raw_status: s.rawStatus,
  });
  if (error) {
    console.error('[payments] record_payment_status failed', error.message);
    return { result: 'db_error', ok: false };
  }
  const r = data as { result: string; email?: string; order_number?: string };
  if (r.email && r.order_number && (s.status === 'failed' || s.status === 'expired') && r.result === 'recorded') {
    void mails.failed(r.email, r.order_number, s.status);
  }
  return { result: r.result, ok: true };
}
