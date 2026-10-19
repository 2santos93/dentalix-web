import {
  DISCOUNT_REASON_OPTIONS,
  capFor,
  currencyDecimals,
  discountForPercent,
  discountPercent,
  exceedsCap,
  needsReason,
  roleCapMessage,
  PRICE_BELOW_CATALOG_NOTICE,
  effectiveDiscount,
  priceBelowCatalogCapMessage,
  type DiscountRules,
} from './discount-rules';

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
    expect(currencyDecimals('COP')).toBe(0);
    expect(currencyDecimals('eur')).toBe(2);
    expect([85000, 123457, 99999].map((p) => discountForPercent(p, 7.5, 'COP', 10))).toEqual([
      6375, 9259, 7500,
    ]);
    expect([85.55, 123.45, 0.99].map((p) => discountForPercent(p, 7.5, 'EUR', 10))).toEqual([
      6.42, 9.26, 0.07,
    ]);
    expect(discountForPercent(1005, 10, 'COP', 10)).toBe(100);
    expect(discountForPercent(10.05, 10, 'EUR', 10)).toBe(1);
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
