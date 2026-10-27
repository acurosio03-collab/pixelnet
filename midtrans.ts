import 'server-only';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/security/tokens';
import { midtransSignature, normalizeMidtransStatus, str } from './midtrans-core';
import {
  NotConfiguredError,
  TemporaryProviderError,
  WebhookVerificationError,
  type CheckoutInput,
  type CheckoutResult,
  type NormalizedStatus,
  type PaymentProvider,
  type TransactionState,
} from './types';

/**
 * Midtrans (Snap) adapter.
 *
 * Verified against docs.midtrans.com:
 *  - Create transaction:  POST {snap}/snap/v1/transactions
 *      sandbox    https://app.sandbox.midtrans.com   production https://app.midtrans.com
 *      auth       Authorization: Basic base64(SERVER_KEY + ":")
 *      body       transaction_details{order_id, gross_amount(int)}, customer_details, ...
 *      response   201 { token, redirect_url }
 *  - Notification signature:  signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)
 *  - A transaction is successful only if status_code "200" AND transaction_status settlement|capture
 *    AND (for capture) fraud_status accept.
 *  - Docs recommend confirming a notification with the Get Status API (done below).
 *
 * Re-checked against docs.midtrans.com on 2026-10-27:
 *  - Snap request accepts `expiry {start_time?, unit, duration}` and `callbacks.finish` (docs: Snap Advanced Feature).
 *  - Get Status: GET https://api.sandbox.midtrans.com/v2/{order_id}/status with Basic auth (docs: GET Status API Requests).
 *
 * Still to confirm yourself before going LIVE (not shown on the pages read):
 *  - the production host of Get Status (https://api.midtrans.com is the standard Core API host);
 *  - the signature_key formula, kept from the earlier verification, on the "Verifying Authenticity of Notification" page.
 */

const snapBase = () => (env.midtransIsProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com');
const coreBase = () => (env.midtransIsProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com');
const authHeader = () => 'Basic ' + Buffer.from(env.midtransServerKey + ':').toString('base64');

function toState(body: Record<string, unknown>): TransactionState {
  const amount = Number(str(body.gross_amount));
  const txId = str(body.transaction_id) || null;
  const normalized = normalizeMidtransStatus(body);
  return {
    eventId: `${txId ?? str(body.order_id)}:${str(body.transaction_status)}:${str(body.status_code)}`,
    orderNumber: str(body.order_id),
    providerTransactionId: txId,
    amount: Number.isFinite(amount) ? amount : NaN,
    currency: (str(body.currency) || 'IDR').toUpperCase(),
    rawStatus: `${str(body.transaction_status)}${str(body.fraud_status) ? '/' + str(body.fraud_status) : ''}`,
    status: normalized,
  };
}

export const midtrans: PaymentProvider = {
  id: 'midtrans',
  label: 'Midtrans (QRIS, e-wallet, bank transfer, cards)',

  isConfigured() {
    return Boolean(env.midtransServerKey);
  },

  statusNote() {
    if (!env.midtransServerKey) return 'MIDTRANS_SERVER_KEY is not set.';
    return env.midtransIsProduction ? 'Production mode.' : 'SANDBOX mode — no real money moves.';
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (!this.isConfigured()) throw new NotConfiguredError('Midtrans is not configured');
    if (input.currency !== 'IDR') throw new Error('Midtrans adapter only supports IDR');

    const gross = Math.round(input.amount);
    const res = await fetch(`${snapBase()}/snap/v1/transactions`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({
        transaction_details: { order_id: input.orderNumber, gross_amount: gross },
        item_details: [{ id: input.orderNumber, price: gross, quantity: 1, name: input.itemName.slice(0, 50) }],
        customer_details: { first_name: input.buyerName.slice(0, 50), email: input.buyerEmail },
        expiry: { unit: 'minutes', duration: Math.max(1, input.expiresInMinutes) },
        callbacks: { finish: input.finishUrl },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as { token?: string; redirect_url?: string; error_messages?: string[] };
    if (!res.ok || !json.redirect_url) {
      console.error('[midtrans] create failed', res.status, json.error_messages ?? '');
      throw new Error(`Midtrans rejected the transaction (HTTP ${res.status})`);
    }
    return { redirectUrl: json.redirect_url, providerReference: json.token };
  },

  async getTransactionStatus(orderNumber: string): Promise<TransactionState | null> {
    if (!this.isConfigured()) throw new NotConfiguredError('Midtrans is not configured');
    let res: Response;
    try {
      res = await fetch(`${coreBase()}/v2/${encodeURIComponent(orderNumber)}/status`, {
        headers: { Accept: 'application/json', Authorization: authHeader() },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new TemporaryProviderError('Midtrans status API unreachable');
    }
    if (res.status >= 500) throw new TemporaryProviderError(`Midtrans status API ${res.status}`);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new TemporaryProviderError('Midtrans status API returned no JSON');
    const code = str(body.status_code);
    if (code === '404' || res.status === 404) return null; // transaction does not exist (yet)
    if (code === '401' || res.status === 401) throw new Error('Midtrans server key rejected (401)');
    if (!body.transaction_status) return null;
    return toState(body);
  },

  async verifyWebhook(rawBody: string, _headers: Headers): Promise<TransactionState | null> {
    if (!this.isConfigured()) throw new NotConfiguredError('Midtrans is not configured');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new WebhookVerificationError('Body is not JSON');
    }
    const orderId = str(body.order_id);
    const statusCode = str(body.status_code);
    const gross = str(body.gross_amount);
    const signature = str(body.signature_key);
    if (!orderId || !statusCode || !gross || !signature) throw new WebhookVerificationError('Missing signature fields');

    const expected = midtransSignature(orderId, statusCode, gross, env.midtransServerKey);
    if (!safeEqual(expected.toLowerCase(), signature.toLowerCase())) {
      throw new WebhookVerificationError('Signature mismatch');
    }

    // Challenge-response: never act on the callback body alone. Ask Midtrans for the real state.
    const confirmed = await this.getTransactionStatus(orderId);
    if (!confirmed) return null;
    if (confirmed.orderNumber !== orderId) throw new WebhookVerificationError('Order id mismatch');
    return confirmed;
  },

  normalizePaymentStatus: normalizeMidtransStatus,
};
