import { discountForPercent, exceedsCap, type DiscountRules } from '@/lib/discounts/discount-rules';
import vectors from './rounding-vectors.json';
import {
  contractRoundingDigits,
  installmentAmounts,
  lineCents,
  linesTotal,
  roundingDigits,
  unitCents,
  type RoundingDigits,
} from './line-rounding';
import { amountCents } from './round';

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

  it.each(vectors.installmentSplit)(
    'DX-488: cuotas de $financed $currency en $count (mismos vectores que la API)',
    ({ currency, financed, count, installments }) => {
      expect(installmentAmounts(financed, count, digitsOf(currency))).toEqual(installments);
    },
  );
});

describe('cuotas de un plan de pagos en unidades de la moneda (DX-488, espejo de generateSchedule)', () => {
  /** El reparto al céntimo de antes de DX-488. */
  function centsSplit(financedCents: number, n: number): number[] {
    const base = Math.floor(financedCents / n);
    return Array.from({ length: n }, (_, i) => (i === n - 1 ? financedCents - base * (n - 1) : base));
  }

  it('JPY 10000 en 3 = 3333, 3333, 3334; USD 100 en 3 = 33.33, 33.33, 33.34', () => {
    expect(installmentAmounts(10000, 3, 0)).toEqual([3333, 3333, 3334]);
    expect(installmentAmounts(100, 3, 2)).toEqual([33.33, 33.33, 33.34]);
    expect(installmentAmounts(100, 3, 1)).toEqual([33.3, 33.3, 33.4]);
  });

  it('sin cuotas válidas o sin nada que financiar no hay reparto', () => {
    expect(installmentAmounts(100, 0, 2)).toEqual([]);
    expect(installmentAmounts(100, 1.5, 2)).toEqual([]);
    expect(installmentAmounts(-1, 3, 2)).toEqual([]);
    expect(installmentAmounts(0, 2, 0)).toEqual([0, 0]);
  });

  /** Casos con semilla fija (sin dependencias: mulberry32). */
  function cases(seed: number, runs: number): { cents: number; n: number }[] {
    let a = seed;
    const rand = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [
      { cents: 0, n: 1 },
      { cents: 1, n: 600 },
      { cents: 10_000_000, n: 600 },
      { cents: 1_000_050, n: 3 },
    ];
    for (let i = 0; i < runs; i++) {
      out.push({ cents: Math.floor(rand() * 10_000_001), n: 1 + Math.floor(rand() * 600) });
    }
    return out;
  }

  it('propiedad: con 2 decimales, el reparto al céntimo de siempre', () => {
    for (const { cents, n } of cases(488, 500)) {
      expect(installmentAmounts(cents / 100, n, 2).map(amountCents)).toEqual(centsSplit(cents, n));
    }
  });

  it('propiedad: suma exacta y cuotas 1..n−1 en unidades enteras, para 0, 1 y 2 decimales', () => {
    for (const digits of [0, 1, 2] as RoundingDigits[]) {
      const unit = 10 ** (2 - digits);
      for (const { cents, n } of cases(4880 + digits, 500)) {
        const out = installmentAmounts(cents / 100, n, digits).map(amountCents);
        expect(out).toHaveLength(n);
        expect(out.reduce((sum, c) => sum + c, 0)).toBe(cents);
        expect(out.slice(0, -1).every((c) => c % unit === 0 && c >= 0)).toBe(true);
        expect(out[n - 1]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
