# SpeedCash — activation checklist

**Status: `NOT_CONFIGURED`.** `src/lib/payments/speedcash.ts` implements the `PaymentProvider` interface but every
method either throws `NotConfiguredError` or returns `unknown`. `IMPLEMENTED = false`, so `isConfigured()` is always
`false`: checkout will not offer SpeedCash and the admin dashboard shows it as "not configured".

## Why

The brief says: do not invent endpoints, parameter names, signature formats or verification rules. When this was built
no official SpeedCash merchant API documentation could be read and verified (a web search returned no public
developer docs, and the docs site named in earlier notes was not reachable). So nothing was guessed.

## What you need from SpeedCash

1. An approved merchant account and **sandbox** credentials.
2. The official API documentation for: creating a payment / QRIS, authentication (API key? OAuth token? signature?),
   status inquiry by merchant order id, the callback (webhook) and how to authenticate it, and the list of status codes.
3. Confirmation that your merchant account has the payment methods you want (e.g. QRIS).

## What to fill in (five TODOs in `speedcash.ts`)

| TODO | Method | Needs from the docs |
| --- | --- | --- |
| 1 | `createCheckout` | endpoint, auth headers/signature, body fields; return a payment URL / QR page URL. Use `input.orderNumber` as the merchant order reference and `input.expiresInMinutes` as the expiry. |
| 2 | `verifyWebhook` | how the callback is authenticated (signature/HMAC/IP list). Verify against the **raw** body. Throw `WebhookVerificationError` when it fails. |
| 3 | `getTransactionStatus` + challenge-response | status-inquiry endpoint. After authenticating a callback, ask SpeedCash for the real state and return that, as the Midtrans adapter does. |
| 4 | `eventId` | a stable id for "same provider state" so repeated callbacks are deduplicated (`payment_events` unique key). |
| 5 | `normalizePaymentStatus` | map documented codes to `paid / pending / failed / expired / refunded`. Never return `paid` for anything you have not verified. |

Then set `SPEEDCASH_API_KEY`, `SPEEDCASH_API_SECRET`, `SPEEDCASH_BASE_URL` (rename to match the real auth scheme),
test in the sandbox, and only then flip `IMPLEMENTED` to `true`. The webhook URL to register is
`https://YOUR-DOMAIN/api/webhooks/speedcash`.

Everything downstream (amount/currency match, idempotency, atomic activation, refund handling) is already provider-neutral
and lives in `applyTransactionState` and the Postgres functions.
