import 'server-only';
import {
  NotConfiguredError,
  type CheckoutInput,
  type CheckoutResult,
  type NormalizedStatus,
  type PaymentProvider,
  type TransactionState,
} from './types';

/**
 * SpeedCash adapter — STATUS: NOT_CONFIGURED (deliberately).
 *
 * Why: no official SpeedCash merchant API specification could be read and verified while this project was built
 * (a web search found no public developer docs, and the documentation site mentioned in earlier notes —
 * qris-mpm-docs.speedcash.co.id — was not reachable from the build environment). Nothing below is guessed:
 * no endpoints, no parameter names, no signature format.
 *
 * To enable (see docs/SPEEDCASH.md for the full checklist):
 *  1. Get an approved merchant account + sandbox credentials from SpeedCash.
 *  2. Read the official docs yourself and fill in the five TODO blocks below, copying the exact
 *     endpoint paths, auth/signature scheme, field names, status codes and callback signature rules.
 *  3. Test in SpeedCash's sandbox, then flip IMPLEMENTED to true.
 *
 * Environment variables (names are placeholders — adapt to the real auth scheme):
 *  SPEEDCASH_API_KEY, SPEEDCASH_API_SECRET, SPEEDCASH_BASE_URL
 */

/** Flip to true ONLY after every TODO below is implemented against the official docs and tested in sandbox. */
const IMPLEMENTED = false;

export const speedcash: PaymentProvider = {
  id: 'speedcash',
  label: 'SpeedCash (QRIS)',

  isConfigured() {
    return IMPLEMENTED && Boolean(process.env.SPEEDCASH_API_KEY && process.env.SPEEDCASH_API_SECRET && process.env.SPEEDCASH_BASE_URL);
  },

  statusNote() {
    return IMPLEMENTED
      ? undefined
      : 'NOT_CONFIGURED — adapter not implemented: official merchant API spec and credentials are required (see docs/SPEEDCASH.md).';
  },

  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    // TODO(1): create-transaction/QRIS-generate request: endpoint, auth + signature headers, body fields.
    //          Must map input.orderNumber to the provider's merchant order reference and return a payment URL or QR payload page.
    throw new NotConfiguredError('SpeedCash adapter is NOT_CONFIGURED');
  },

  async verifyWebhook(_rawBody: string, _headers: Headers): Promise<TransactionState | null> {
    // TODO(2): authenticate the callback exactly as documented (signature/HMAC/IP allow-list/etc.), using the RAW body.
    // TODO(3): confirm with the provider's status-inquiry endpoint before trusting the callback (challenge-response).
    // TODO(4): build a stable eventId (same provider state => same id) for idempotency.
    throw new NotConfiguredError('SpeedCash adapter is NOT_CONFIGURED');
  },

  async getTransactionStatus(_orderNumber: string): Promise<TransactionState | null> {
    // TODO(3): status-inquiry request by merchant order reference.
    throw new NotConfiguredError('SpeedCash adapter is NOT_CONFIGURED');
  },

  normalizePaymentStatus(_raw: Record<string, unknown>): NormalizedStatus {
    // TODO(5): map the provider's documented status codes to paid | pending | failed | expired | refunded.
    // Until verified, never return 'paid' for anything.
    return 'unknown';
  },
};
