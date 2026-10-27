import { z } from 'zod';
import { cleanText, isValidEmail } from '@/lib/security/sanitize';

const text = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .transform((s) => cleanText(s, max))
    .refine((s) => s.length >= min, `${label} must be at least ${min} characters`);

export const checkoutSchema = z.object({
  packageSlug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'Choose a package'),
  x: z.coerce.number().int().min(0).max(1000),
  y: z.coerce.number().int().min(0).max(1000),
  brandName: text(2, 80, 'Business or brand name'),
  advertiserName: text(2, 80, 'Your name'),
  email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .refine(isValidEmail, 'Enter a valid email address'),
  country: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine((s) => /^[A-Z]{2}$/.test(s), 'Choose your country'),
  title: text(3, 80, 'Ad title'),
  description: z
    .string()
    .optional()
    .transform((s) => cleanText(s ?? '', 280)),
  targetUrl: z.string().min(1, 'Destination link is required').max(500),
  provider: z.enum(['midtrans', 'speedcash']),
  acceptTerms: z.literal('true', { errorMap: () => ({ message: 'You must accept the terms and advertising policy' }) }),
});

export const renewSchema = z.object({
  order: z.string().regex(/^PN-[A-Z0-9]{10}$/),
  t: z.string().min(10).max(200),
  provider: z.enum(['midtrans', 'speedcash']),
});

export const reportSchema = z.object({
  adId: z.string().uuid(),
  reason: z.enum(['scam', 'malware', 'illegal', 'adult', 'misleading', 'other']),
  details: z.string().optional().transform((s) => cleanText(s ?? '', 1000)),
  email: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim().toLowerCase())
    .refine((s) => s === '' || isValidEmail(s), 'Enter a valid email or leave it empty'),
});
