import type { ClinicLocation } from '@/lib/locations/locations-api';

/**
 * Sede de prueba (GLOBAL-G1). El fixture base es, a propósito y de forma
 * explícita, una sede ya revisada (USD · America/Caracas · es-VE · 12 h):
 * es el dato de los tests, no un valor por defecto del producto. Cada test que
 * dependa de la moneda, la zona o el formato lo fija con `overrides`; una sede
 * sin configurar se construye con `currency`/`timeZone`/`locale`/`hourCycle` a `null`.
 */
export function clinicLocation(overrides: Partial<ClinicLocation> = {}): ClinicLocation {
  return {
    id: 'loc-1',
    name: 'Sede principal',
    address: null,
    country: 'VE',
    healthRegistrationNumber: null,
    showHealthRegistrationNumber: false,
    phone: null,
    // DX-387: el formato internacional que calcula la API (null = sin él).
    phoneInternational: null,
    // DX-329: sin prefijo telefónico por defecto; el test que lo use lo fija.
    defaultPhoneRegion: null,
    // DX-524: sin nombres propios, hereda los de la clínica.
    docTypeNames: { NATIONAL_ID: null, PASSPORT: null, RESIDENCE_PERMIT: null, TAX_ID: null, OTHER: null },
    isActive: true,
    currency: 'USD',
    timeZone: 'America/Caracas',
    locale: 'es-VE',
    hourCycle: 'h12',
    regionalSettingsReviewedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
