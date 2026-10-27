import { clinicBaseCurrency, locationCurrency, locationFormat, locationTimeZone } from './location-settings';
import { clinicLocation } from '@/lib/test/locations';

describe('locationCurrency', () => {
  it('la moneda de la sede, sea cual sea su país', () => {
    expect(locationCurrency(clinicLocation({ currency: 'JPY' }))).toBe('JPY');
    expect(locationCurrency(clinicLocation({ country: 'ES', currency: 'MXN' }))).toBe('MXN');
  });

  it('sede sin moneda (sin configurar) → null, nunca la de su país', () => {
    expect(locationCurrency(clinicLocation({ country: 'CO', currency: null }))).toBeNull();
    expect(locationCurrency(clinicLocation({ currency: 'pesos' }))).toBeNull();
    expect(locationCurrency(null)).toBeNull();
  });
});

describe('locationTimeZone', () => {
  it('la zona de la sede, también fuera de la lista habitual', () => {
    expect(locationTimeZone(clinicLocation({ timeZone: 'Asia/Tokyo' }))).toBe('Asia/Tokyo');
    expect(locationTimeZone(clinicLocation({ timeZone: 'UTC' }))).toBe('UTC');
  });

  it('sin zona o con una que no existe → null, nunca Bogotá', () => {
    expect(locationTimeZone(clinicLocation({ country: 'CO', timeZone: null }))).toBeNull();
    expect(locationTimeZone(clinicLocation({ timeZone: 'Mars/Olympus' }))).toBeNull();
    expect(locationTimeZone(undefined)).toBeNull();
  });
});

describe('locationFormat', () => {
  it('the locale and hourCycle of the location, whatever its country', () => {
    expect(locationFormat(clinicLocation({ country: 'CO', locale: 'en-US', hourCycle: 'h23' }))).toEqual({
      locale: 'en-US',
      hourCycle: 'h23',
    });
    expect(locationFormat(clinicLocation({ locale: 'ja-JP', hourCycle: 'h12' }))).toEqual({
      locale: 'ja-JP',
      hourCycle: 'h12',
    });
  });

  it('without locale or hourCycle, or with an unusable one → null, never another value', () => {
    expect(locationFormat(clinicLocation({ locale: null }))).toBeNull();
    expect(locationFormat(clinicLocation({ hourCycle: null }))).toBeNull();
    expect(locationFormat(clinicLocation({ locale: 'not a locale' }))).toBeNull();
    expect(locationFormat(clinicLocation({ hourCycle: 'h11' as unknown as 'h12' }))).toBeNull();
    expect(locationFormat(null)).toBeNull();
    expect(locationFormat(undefined)).toBeNull();
  });
});

describe('clinicBaseCurrency', () => {
  it('la moneda común de las sedes activas', () => {
    expect(clinicBaseCurrency([clinicLocation({ currency: 'JPY' })])).toBe('JPY');
    expect(
      clinicBaseCurrency([clinicLocation({ id: 'a', currency: 'COP' }), clinicLocation({ id: 'b', currency: 'COP' })]),
    ).toBe('COP');
  });

  // Revisión D-3: el catálogo es de toda la clínica; con sedes en monedas
  // distintas el mismo precio no puede ser de una u otra según la sede elegida.
  it('sedes activas con monedas distintas → sin moneda', () => {
    expect(
      clinicBaseCurrency([clinicLocation({ id: 'a', currency: 'COP' }), clinicLocation({ id: 'b', currency: 'EUR' })]),
    ).toBeNull();
  });

  it('solo cuentan las sedes activas', () => {
    expect(
      clinicBaseCurrency([
        clinicLocation({ id: 'x', currency: 'EUR', isActive: false }),
        clinicLocation({ id: 'a', currency: 'COP' }),
      ]),
    ).toBe('COP');
  });

  it('una sede activa sin moneda deja la clínica sin moneda común, nunca COP', () => {
    expect(
      clinicBaseCurrency([clinicLocation({ id: 'a', currency: 'COP' }), clinicLocation({ id: 'b', currency: null })]),
    ).toBeNull();
    expect(clinicBaseCurrency([clinicLocation({ country: 'CO', currency: null })])).toBeNull();
  });

  it('sin sedes activas no hay moneda que adivinar', () => {
    expect(clinicBaseCurrency([])).toBeNull();
    expect(clinicBaseCurrency([clinicLocation({ isActive: false })])).toBeNull();
  });
});
