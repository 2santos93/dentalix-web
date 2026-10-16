import { clinicBaseCurrency, COUNTRY_CURRENCY } from './clinic-currency';
import type { ClinicLocation } from './locations-api';

function loc(id: string, country: ClinicLocation['country'], isActive = true): ClinicLocation {
  return {
    id,
    name: id,
    address: null,
    country,
    isActive,
    timeZone: country === 'ES' ? 'Europe/Madrid' : 'America/Bogota',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('clinicBaseCurrency', () => {
  it('cada país de sede tiene su moneda', () => {
    expect(COUNTRY_CURRENCY).toEqual({ CO: 'COP', ES: 'EUR' });
  });

  it('una clínica en Colombia trabaja en COP', () => {
    expect(clinicBaseCurrency([loc('a', 'CO')])).toBe('COP');
  });

  it('varias sedes del mismo país comparten moneda', () => {
    expect(clinicBaseCurrency([loc('a', 'CO'), loc('b', 'CO')])).toBe('COP');
  });

  // Revisión D-3: el catálogo es de toda la clínica; con sedes en CO y ES el
  // mismo precio no puede ser pesos o euros según la sede elegida.
  it('sedes activas de varios países (CO+ES) → sin moneda', () => {
    expect(clinicBaseCurrency([loc('a', 'CO'), loc('b', 'ES')])).toBeNull();
  });

  it('solo cuentan las sedes activas', () => {
    expect(clinicBaseCurrency([loc('x', 'ES', false), loc('a', 'CO')])).toBe('COP');
  });

  it('sin sedes activas no hay moneda que adivinar', () => {
    expect(clinicBaseCurrency([])).toBeNull();
    expect(clinicBaseCurrency([loc('x', 'ES', false)])).toBeNull();
  });
});
