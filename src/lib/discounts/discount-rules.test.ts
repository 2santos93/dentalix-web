import {
  DISCOUNT_REASON_OPTIONS,
  capFor,
  discountForPercent,
  discountPercent,
  exceedsCap,
  needsReason,
  noDiscountAllowed,
  NO_DISCOUNT_ALLOWED_NOTICE,
  roleCapMessage,
  PRICE_BELOW_CATALOG_NOTICE,
  effectiveDiscount,
  priceBelowCatalogCapMessage,
  type DiscountRules,
} from './discount-rules';
import * as discountRules from './discount-rules';
// Copia de la referencia de FORMATO de la API (`prisma/reference/iso4217.ts`
// → `cldr-format-digits-zero.json`, CLDR 47 fijado). Desde DX-340 el redondeo
// no usa ninguna lista de la web: los dígitos los manda la API
// (`currencyDigits.roundingDigits`); los de abajo son los de la referencia
// versionada de la API, compartida en `rounding-vectors.json`.
import cldrFormatDigits from '@/lib/money/cldr-format-digits-zero.json';
import roundingVectors from '@/lib/money/rounding-vectors.json';

const digitsOf = (code: keyof typeof roundingVectors.currencies) =>
  roundingVectors.currencies[code].roundingDigits as 0 | 2;

const RULES: DiscountRules = {
  maxPercentByRole: { ADMIN: 100, DENTIST: 10, ASSISTANT: 0, RECEPTION: 0 },
  reasonRequiredAbovePercent: 10,
};

describe('reglas de descuento (DX-204)', () => {
  it('tope por rol, en céntimos', () => {
    expect(capFor(RULES, 'DENTIST')).toBe(10);
    expect(capFor(RULES, null)).toBe(0);
    expect(exceedsCap(RULES, 'DENTIST', 1000, 100)).toBe(false);
    expect(exceedsCap(RULES, 'DENTIST', 1000, 150)).toBe(true);
    expect(exceedsCap(RULES, 'DENTIST', 999.9, 100)).toBe(true);
    expect(exceedsCap(RULES, 'ASSISTANT', 100, 0)).toBe(false);
    expect(roleCapMessage(10)).toBe('Tu rol permite hasta un 10 % de descuento por ítem.');
  });

  it('el motivo se pide estrictamente por encima del umbral', () => {
    expect(needsReason(RULES, 1000, 100)).toBe(false);
    expect(needsReason(RULES, 1000, 101)).toBe(true);
    expect(needsReason(RULES, 1000, 0)).toBe(false);
  });

  it('redondeo por moneda: COP sin decimales, EUR a céntimos, tope ítem a ítem', () => {
    expect(digitsOf('COP')).toBe(0);
    expect(digitsOf('EUR')).toBe(2);
    expect([85000, 123457, 99999].map((p) => discountForPercent(p, 7.5, digitsOf('COP'), 10))).toEqual([
      6375, 9259, 7500,
    ]);
    expect([85.55, 123.45, 0.99].map((p) => discountForPercent(p, 7.5, digitsOf('EUR'), 10))).toEqual([
      6.42, 9.26, 0.07,
    ]);
    expect(discountForPercent(1005, 10, digitsOf('COP'), 10)).toBe(100);
    expect(discountForPercent(10.05, 10, digitsOf('EUR'), 10)).toBe(1);
  });

  it('% sobre el precio y catálogo de motivos', () => {
    expect(discountPercent(3, 1)).toBe(33.33);
    expect(discountPercent(0, 0)).toBe(0);
    expect(DISCOUNT_REASON_OPTIONS).toContain('OTHER');
  });
});

describe('descuento efectivo: precio por debajo del de catálogo (SEC-041)', () => {
  it('rebaja + descuento sobre el precio de catálogo; subir el precio no resta', () => {
    expect(effectiveDiscount(1_000_000, 900_000, 50_000)).toEqual({
      listPrice: 1_000_000,
      priceReduction: 100_000,
      total: 150_000,
    });
    expect(effectiveDiscount(1000, 1200, 0)).toEqual({ listPrice: 1200, priceReduction: 0, total: 0 });
  });

  it('un ítem libre (sin precio de catálogo) solo cuenta su descuento', () => {
    expect(effectiveDiscount(null, 1, 0)).toEqual({ listPrice: 1, priceReduction: 0, total: 0 });
  });

  it('sin `catalogPrice` en la respuesta (API anterior a SEC-041) es un ítem libre, no rompe', () => {
    expect(effectiveDiscount(undefined, 900, 100)).toEqual({ listPrice: 900, priceReduction: 0, total: 100 });
  });

  it('en céntimos exactos', () => {
    expect(effectiveDiscount(0.3, 0.1, 0.1)).toEqual({ listPrice: 0.3, priceReduction: 0.2, total: 0.3 });
  });

  it('con el tope y el umbral de DX-204, sobre el precio de referencia', () => {
    const half = effectiveDiscount(1_000_000, 500_000, 0);
    expect(exceedsCap(RULES, 'DENTIST', half.listPrice, half.total)).toBe(true);
    const ninetyFive = effectiveDiscount(1_000_000, 950_000, 0);
    expect(exceedsCap(RULES, 'DENTIST', ninetyFive.listPrice, ninetyFive.total)).toBe(false);
    expect(needsReason(RULES, ninetyFive.listPrice, ninetyFive.total)).toBe(false);
    const eighty = effectiveDiscount(1_000_000, 800_000, 0);
    expect(needsReason(RULES, eighty.listPrice, eighty.total)).toBe(true);
  });

  it('mensajes iguales a los de la API', () => {
    expect(PRICE_BELOW_CATALOG_NOTICE).toBe('Precio por debajo del de catálogo: cuenta como descuento.');
    expect(priceBelowCatalogCapMessage(10)).toBe(
      'Precio por debajo del de catálogo: cuenta como descuento. Tu rol permite hasta un 10 % de descuento por ítem.',
    );
  });
});

describe('referencia del descuento y prestaciones sin descuento (DX-105)', () => {
  it('la base es el precio de referencia resuelto (catalogPrice): sin cambio de fórmula', () => {
    // Convenio: lista 50.000, referencia 40.000. Cobrar 36.000 rebaja 4.000
    // sobre la referencia, no 14.000 sobre la lista.
    const e = effectiveDiscount(40000, 36000, 0);
    expect(e.priceReduction).toBe(4000);
    expect(e.listPrice).toBe(40000);
    expect(e.total).toBe(4000);
    // Cobrar la referencia no es descuento.
    expect(effectiveDiscount(40000, 40000, 0).total).toBe(0);
  });

  it('noDiscountAllowed solo si allowDiscount es false de forma explícita', () => {
    expect(noDiscountAllowed({ allowDiscount: false })).toBe(true);
    expect(noDiscountAllowed({ allowDiscount: true })).toBe(false);
    expect(noDiscountAllowed({})).toBe(false);
    expect(noDiscountAllowed(null)).toBe(false);
    expect(noDiscountAllowed(undefined)).toBe(false);
    expect(NO_DISCOUNT_ALLOWED_NOTICE).toBe('Esta prestación no admite descuentos.');
  });
});

describe('decimales por moneda sin lista en la web (GLOBAL-G1 R7, DX-340)', () => {
  it('la web ya no tiene lista de monedas sin decimales para redondear', () => {
    expect('ZERO_DECIMAL_CURRENCIES' in discountRules).toBe(false);
    expect('currencyDecimals' in discountRules).toBe(false);
  });

  it('el redondeo vigente se conserva: los 29 códigos de antes redondean a 0', () => {
    // La lista fija anterior (CLDR 47 ∪ COP, CLP, JPY, KRW, PYG) es ahora
    // `currencies.rounding_digits = 0` en la API; los vectores lo fijan para
    // las monedas de la paridad.
    expect(digitsOf('RSD')).toBe(0);
    expect(digitsOf('COP')).toBe(0);
    expect(digitsOf('JPY')).toBe(0);
    expect(digitsOf('EUR')).toBe(2);
    expect(discountForPercent(123.45, 7.5, digitsOf('RSD'), 100)).toBe(9);
  });

  it('formato: la copia coincide con la referencia CLDR 47 fijada, sin el Intl del host', () => {
    // Fijada aquí en literal: no se compara con el Intl del Node del host, que
    // cambia con su versión de ICU (TST-046: RSD da 0 decimales con ICU 77 y
    // 2 con ICU 78).
    expect(cldrFormatDigits.cldr).toBe('47.0');
    expect(cldrFormatDigits.cldrDigitsZero).toEqual([
      'AFN', 'ALL', 'BIF', 'CLP', 'DJF', 'GNF', 'IRR', 'ISK', 'JPY', 'KMF',
      'KPW', 'KRW', 'LAK', 'LBP', 'MGA', 'MMK', 'PYG', 'RSD', 'RWF', 'SOS',
      'SYP', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF', 'YER',
    ]);
    expect(cldrFormatDigits.cldrDigitsZero).toHaveLength(28);
  });
});
