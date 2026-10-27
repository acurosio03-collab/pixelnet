import 'server-only';
import { midtrans } from './midtrans';
import { speedcash } from './speedcash';
import type { PaymentProvider, ProviderId } from './types';
import type { ProviderInfo } from '@/lib/types';

const registry: Record<ProviderId, PaymentProvider> = { midtrans, speedcash };

export function getProvider(id: string): PaymentProvider | null {
  return id === 'midtrans' || id === 'speedcash' ? registry[id] : null;
}

export function providerInfos(): ProviderInfo[] {
  return (Object.values(registry) as PaymentProvider[]).map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
    note: p.statusNote(),
  }));
}

/** Preferred provider from settings if usable, otherwise the first configured one (never an unusable one). */
export function pickDefault(preferred: string | undefined): ProviderId {
  const infos = providerInfos();
  const pref = infos.find((i) => i.id === preferred && i.configured);
  return (pref ?? infos.find((i) => i.configured) ?? infos.find((i) => i.id === 'midtrans')!).id;
}

export * from './types';
