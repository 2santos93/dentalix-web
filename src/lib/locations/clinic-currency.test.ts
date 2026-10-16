import { clinicBaseCurrency, COUNTRY_CURRENCY } from './clinic-currency';
import type { ClinicLocation } from './locations-api';

function loc(id: string, country: ClinicLocation['country'], isActive = true): ClinicLocation {
  return { id, name: id, address: null, country, isActive, createdAt: '2026-01-01T00:00:00Z' };
}

describe('clinicBaseCurrency', () => {
  it('cada país de sede tiene su moneda', () => {
    expect(COUNTRY_CURRENCY).toEqual({ CO: 'COP', ES: 'EUR' });
  });

  it('una clínica en Colombia trabaja en COP', () => {
    expect(clinicBaseCurrency([loc('a', 'CO')], null)).toBe('COP');
  });

  it('con sede activa, manda el país de esa sede', () => {
    expect(clinicBaseCurrency([loc('a', 'CO'), loc('b', 'ES')], 'b')).toBe('EUR');
  });

  it('en la vista consolidada, la sede principal (la primera activa)', () => {
    expect(clinicBaseCurrency([loc('x', 'ES', false), loc('a', 'CO'), loc('b', 'ES')], null)).toBe(
      'COP',
    );
  });

  it('una sede activa que ya no existe cae en la principal', () => {
    expect(clinicBaseCurrency([loc('a', 'CO')], 'borrada')).toBe('COP');
  });

  it('sin sedes no hay moneda que adivinar', () => {
    expect(clinicBaseCurrency([], null)).toBeNull();
  });
});
