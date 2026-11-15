import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-020: la tarjeta «Pon en marcha tu clínica» de Inicio. Los tipos salen del
// contrato generado; el estado de cada paso lo calcula la API.
type Schemas = components['schemas'];
export type OnboardingStatus = Schemas['OnboardingStatusDto'];
export type OnboardingStep = Schemas['OnboardingStepDto'];
export type OnboardingStepKey = Schemas['OnboardingStepKey'];

/** Solo ADMIN, como `ONBOARDING_ROLES` en la API. */
export function canSeeOnboarding(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export async function getOnboardingStatus(token: string): Promise<OnboardingStatus> {
  return apiFetch<OnboardingStatus>('/onboarding/status', { token });
}

/** Idempotente: devuelve el estado ya descartado. */
export async function dismissOnboarding(token: string): Promise<OnboardingStatus> {
  return apiFetch<OnboardingStatus>('/onboarding/dismiss', { method: 'POST', token });
}

const DISMISSED_HINT_KEY = 'dentalix.onboarding-dismissed';

/**
 * Pista local de que la tarjeta ya se descartó en esta clínica (el host es la
 * clínica): solo evita pintar el esqueleto mientras se pide el estado, para
 * que Inicio no salte en cada visita. La verdad sigue siendo la API.
 */
export function readDismissedHint(): boolean {
  try {
    return window.localStorage.getItem(`${DISMISSED_HINT_KEY}:${window.location.host}`) === '1';
  } catch {
    return false;
  }
}

export function writeDismissedHint(dismissed: boolean): void {
  try {
    const key = `${DISMISSED_HINT_KEY}:${window.location.host}`;
    if (dismissed) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento, solo se pierde la pista.
  }
}
