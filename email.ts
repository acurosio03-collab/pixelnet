import 'server-only';
import { env } from '@/lib/env';
import { escapeHtml, formatMoney } from '@/lib/format';

/**
 * Transactional email through Resend's HTTP API. Optional: with no RESEND_API_KEY nothing is sent
 * and the function returns false (it is logged, never thrown — a mail failure must not break a payment).
 */
export async function sendMail(to: string, subject: string, bodyHtml: string): Promise<boolean> {
  if (!env.resendApiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipped:', subject);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [to],
        subject,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#0b1226;line-height:1.55">${bodyHtml}<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/><p style="font-size:12px;color:#64748b">PIXELNEST — Own a Pixel. Make Your Mark.</p></div>`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error('[email] provider responded', res.status);
    return res.ok;
  } catch (e) {
    console.error('[email] failed', (e as Error).message);
    return false;
  }
}

function btn(url: string, label: string) {
  return `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#22e5ff;color:#04060f;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

export const mails = {
  orderCreated(to: string, orderNumber: string, amount: number, currency: string, trackUrl: string) {
    return sendMail(
      to,
      `Order ${orderNumber} received — complete your payment`,
      `<h2>Your pixel area is reserved</h2><p>Order <b>${escapeHtml(orderNumber)}</b> for ${escapeHtml(formatMoney(amount, currency))}. Complete the payment before the reservation ends or the area is released.</p>${btn(trackUrl, 'Track this order')}<p style="font-size:13px;color:#64748b">Keep this link: it is how you check status and renew later.</p>`,
    );
  },
  activated(to: string, orderNumber: string, trackUrl: string) {
    return sendMail(to, `Payment confirmed — your ad is live (${orderNumber})`, `<h2>Payment confirmed</h2><p>Your ad on the PIXELNEST wall is now live. Your 30 days started the moment it was activated.</p>${btn(trackUrl, 'View your order')}`);
  },
  pendingReview(to: string, orderNumber: string, trackUrl: string) {
    return sendMail(to, `Payment confirmed — ad under review (${orderNumber})`, `<h2>Payment confirmed</h2><p>Your ad is waiting for a quick policy review. Your display period starts when it is approved.</p>${btn(trackUrl, 'View your order')}`);
  },
  renewed(to: string, orderNumber: string, trackUrl: string) {
    return sendMail(to, `Renewal confirmed (${orderNumber})`, `<h2>Renewal confirmed</h2><p>Your ad display period has been extended.</p>${btn(trackUrl, 'View your order')}`);
  },
  failed(to: string, orderNumber: string, status: 'failed' | 'expired') {
    return sendMail(
      to,
      `Payment ${status} (${orderNumber})`,
      `<h2>Payment ${status}</h2><p>We did not receive a successful payment for order <b>${escapeHtml(orderNumber)}</b>, so the reserved area was released. You can pick an area and try again at any time.</p>${btn(env.siteUrl + '/#advertise', 'Choose an area')}`,
    );
  },
  refundRequired(to: string, orderNumber: string) {
    return sendMail(to, `Action needed: refund for order ${orderNumber}`, `<h2>We received your payment, but could not place your ad</h2><p>The reserved period ended and the area was taken before your payment arrived. We will refund order <b>${escapeHtml(orderNumber)}</b> in full. Contact ${escapeHtml(env.contactEmail || 'support')} if you have questions.</p>`);
  },
  rejected(to: string, orderNumber: string, title: string, reason: string, takedown: boolean) {
    return sendMail(
      to,
      `${takedown ? 'Ad removed' : 'Ad not approved'} (${orderNumber})`,
      `<h2>${takedown ? 'Your ad was removed' : 'Your ad was not approved'}</h2><p><b>${escapeHtml(title)}</b></p><p>Reason: ${escapeHtml(reason)}</p><p>See our Advertising Policy and Refund Policy for what happens next.</p>`,
    );
  },
};
