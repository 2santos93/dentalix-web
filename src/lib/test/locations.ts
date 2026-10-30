import type { ClinicLocation } from '@/lib/locations/locations-api';

/**
 * Sede de prueba (GLOBAL-G1). El fixture base es, a propósito y de forma
 * explícita, una sede de Bogotá ya revisada (COP · America/Bogota · es-CO · 12 h):
 * es el dato de los tests, no un valor por defecto del producto. Cada test que
 * dependa de la moneda, la zona o el formato lo fija con `overrides`; una sede
 * sin configurar se construye con `currency`/`timeZone`/`locale`/`hourCycle` a `null`.
 */
export function clinicLocation(overrides: Partial<ClinicLocation> = {}): ClinicLocation {
  return {
    id: 'loc-1',
    name: 'Sede principal',
    address: null,
    country: 'CO',
    healthRegistrationNumber: null,
    showHealthRegistrationNumber: false,
    phone: null,
    // DX-329: sin prefijo telefónico por defecto; el test que lo use lo fija.
    defaultPhoneRegion: null,
    isActive: true,
    currency: 'COP',
    timeZone: 'America/Bogota',
    locale: 'es-CO',
    hourCycle: 'h12',
    regionalSettingsReviewedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
