// Uniform payment-provider contract. Everything provider-specific lives behind this interface.

export type ProviderId = 'speedcash' | 'midtrans';

export type NormalizedStatus = 'paid' | 'pending' | 'failed' | 'expired' | 'refunded' | 'unknown';

export interface CheckoutInput {
  orderNumber: string; // used as the provider's order id
  amount: number; // major units (IDR has no decimals)
  currency: string;
  buyerEmail: string;
  buyerName: string;
  itemName: string;
  finishUrl: string; // where the buyer is sent back (UI only — NEVER proof of payment)
  expiresInMinutes: number;
}

export interface CheckoutResult {
  redirectUrl: string;
  providerReference?: string;
}

/** A provider-confirmed transaction state. Amounts/currency come from the provider, not the browser. */
export interface TransactionState {
  eventId: string; // stable id used for idempotency (same state => same id)
  orderNumber: string;
  providerTransactionId: string | null;
  amount: number;
  currency: string;
  rawStatus: string;
  status: NormalizedStatus;
}

export class NotConfiguredError extends Error {
  readonly code = 'NOT_CONFIGURED';
  constructor(message = 'Payment provider is not configured') {
    super(message);
  }
}

/** The request is not authentic (bad signature etc.) -> respond 401, do not retry. */
export class WebhookVerificationError extends Error {
  readonly code = 'WEBHOOK_INVALID';
}

/** We could not decide right now (provider API down) -> respond 5xx so the provider retries. */
export class TemporaryProviderError extends Error {
  readonly code = 'PROVIDER_TEMPORARY';
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** false => the adapter exists but cannot be used (missing credentials or unverified API spec). */
  isConfigured(): boolean;
  /** Human-readable note shown in admin (why it is not configured, what is missing). */
  statusNote(): string | undefined;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /**
   * Authenticates the callback AND returns the authoritative transaction state.
   * Returns null when the call is authentic but is not about a transaction we know (e.g. a dashboard test ping).
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<TransactionState | null>;
  /** Server-to-server lookup, used to double-check callbacks and to reconcile missed webhooks. */
  getTransactionStatus(orderNumber: string): Promise<TransactionState | null>;
  normalizePaymentStatus(raw: Record<string, unknown>): NormalizedStatus;
}
