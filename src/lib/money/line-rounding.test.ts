import { discountForPercent, exceedsCap, type DiscountRules } from '@/lib/discounts/discount-rules';
import vectors from './rounding-vectors.json';
import { contractRoundingDigits, lineCents, linesTotal, roundingDigits, unitCents } from './line-rounding';

// DX-340: paridad con la API. `rounding-vectors.json` es copia byte a byte de
// `dentalix-api/src/shared/money/rounding-vectors.json` (lo vigila
// `scripts/check-api-reference-sync.mjs`) y la API corre los mismos casos en
// `src/shared/money/rounding-vectors.spec.ts`. Nada depende del Intl del host.

type Code = keyof typeof vectors.currencies;
const digitsOf = (code: string) => roundingDigits(vectors.currencies[code as Code].roundingDigits);

describe('redondeo por línea: vectores compartidos con la API (DX-340)', () => {
  it('RSD tiene 2 minor units ISO y se redondea a 0 (vigente); JPY 0; EUR 2', () => {
    expect(vectors.currencies.RSD).toEqual({ minorUnits: 2, roundingDigits: 0 });
    expect(vectors.currencies.JPY).toEqual({ minorUnits: 0, roundingDigits: 0 });
    expect(vectors.currencies.EUR).toEqual({ minorUnits: 2, roundingDigits: 2 });
  });

  it.each(vectors.discountForPercent)(
    'descuento en bloque $currency: $percent % de $price (tope $capPercent %) = $discount',
    ({ currency, price, percent, capPercent, discount }) => {
      expect(discountForPercent(price, percent, digitsOf(currency), capPercent)).toBe(discount);
    },
  );

  it('123,45 × 7,5 %: 9 en RSD (vigente) y 9,26 si se redondeara a sus 2 minor units', () => {
    expect(discountForPercent(123.45, 7.5, digitsOf('RSD'), 100)).toBe(9);
    for (const alt of vectors.alternativeRoundingDigits) {
      expect(discountForPercent(alt.price, alt.percent, roundingDigits(alt.roundingDigits), alt.capPercent)).toBe(
        alt.discount,
      );
    }
  });

  it.each(vectors.discountLimits)(
    'límite: $discount sobre $price supera el $percent %? $exceeds',
    ({ price, discount, percent, exceeds }) => {
      const rules: DiscountRules = {
        maxPercentByRole: { ADMIN: percent, DENTIST: percent, ASSISTANT: percent, RECEPTION: percent },
        reasonRequiredAbovePercent: 100,
      };
      expect(exceedsCap(rules, 'DENTIST', price, discount)).toBe(exceeds);
    },
  );

  it.each(vectors.linesTotal)('total de líneas en $currency = $total', ({ lines, total }) => {
    expect(linesTotal(lines)).toBe(total);
  });

  it('las líneas se suman en céntimos exactos (0,1 + 0,2 = 0,3)', () => {
    expect(lineCents({ price: 123.45, discount: 9.26 })).toBe(11419);
    expect(linesTotal([{ price: 0.1, discount: 0 }, { price: 0.2, discount: 0 }])).toBe(0.3);
  });

  it('solo 0, 1 o 2 dígitos: una moneda de 3 decimales se rechaza, no se trunca', () => {
    expect(unitCents(0)).toBe(BigInt(100));
    expect(unitCents(2)).toBe(BigInt(1));
    expect(() => roundingDigits(3)).toThrow(/como mucho 2 decimales/);
  });

  it('lee los dígitos del contrato y no los adivina si faltan', () => {
    expect(contractRoundingDigits({ roundingDigits: 0 })).toBe(0);
    expect(contractRoundingDigits({ roundingDigits: 2 })).toBe(2);
    expect(contractRoundingDigits(undefined)).toBeNull();
    expect(contractRoundingDigits(null)).toBeNull();
    // Un valor fuera de rango no rompe la pantalla en el render: se trata
    // como desconocido («se calcula al aplicar»).
    expect(contractRoundingDigits({ roundingDigits: 3 })).toBeNull();
    expect(contractRoundingDigits({ roundingDigits: -1 })).toBeNull();
  });
});
