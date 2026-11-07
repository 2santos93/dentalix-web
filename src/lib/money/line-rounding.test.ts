import { discountForPercent, exceedsCap, type DiscountRules } from '@/lib/discounts/discount-rules';
import vectors from './rounding-vectors.json';
import {
  contractRoundingDigits,
  installmentSplit,
  MAX_INSTALLMENTS,
  lineCents,
  linesTotal,
  roundingDigits,
  unitCents,
  type RoundingDigits,
} from './line-rounding';
import { amountCents } from './round';

/** El calendario completo a partir de la cuota base y la última (solo en las pruebas). */
function expand(financed: number, count: number, digits: RoundingDigits): number[] | null {
  const split = installmentSplit(financed, count, digits);
  return split && Array.from({ length: count }, (_, i) => (i === count - 1 ? split.last : split.base));
}

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
      expect(expand(financed, count, digitsOf(currency))).toEqual(installments);
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
    expect(installmentSplit(10000, 3, 0)).toEqual({ base: 3333, last: 3334 });
    expect(installmentSplit(100, 3, 2)).toEqual({ base: 33.33, last: 33.34 });
    expect(installmentSplit(100, 3, 1)).toEqual({ base: 33.3, last: 33.4 });
    expect(installmentSplit(1200000, 12, 2)).toEqual({ base: 100000, last: 100000 });
  });

  it('sin cuotas válidas (no entero, < 1 o > 600, como la API) o con un financiado negativo no hay reparto', () => {
    expect(MAX_INSTALLMENTS).toBe(600);
    expect(installmentSplit(100, 0, 2)).toBeNull();
    expect(installmentSplit(100, -3, 2)).toBeNull();
    expect(installmentSplit(100, 1.5, 2)).toBeNull();
    expect(installmentSplit(100, Number.NaN, 2)).toBeNull();
    expect(installmentSplit(100, 601, 2)).toBeNull();
    expect(installmentSplit(-1, 3, 2)).toBeNull();
    expect(installmentSplit(0, 2, 0)).toEqual({ base: 0, last: 0 });
  });

  it('M1: un número de cuotas enorme no rompe ni congela: null al instante, sin un array de ese tamaño', () => {
    const started = Date.now();
    for (const count of [99999999999, 1e8, 1e21, Number.MAX_SAFE_INTEGER, Infinity]) {
      expect(installmentSplit(10000, count, 0)).toBeNull();
    }
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('600 cuotas (el máximo) sí se reparten: JPY 1000000 en 600 = 1666 y la última 2066', () => {
    expect(installmentSplit(1000000, 600, 0)).toEqual({ base: 1666, last: 1000000 - 1666 * 599 });
    expect(installmentSplit(1000000, 600, 0)?.last).toBe(2066);
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
      expect(expand(cents / 100, n, 2)?.map(amountCents)).toEqual(centsSplit(cents, n));
    }
  });

  it('propiedad: suma exacta y cuotas 1..n−1 en unidades enteras, para 0, 1 y 2 decimales', () => {
    for (const digits of [0, 1, 2] as RoundingDigits[]) {
      const unit = 10 ** (2 - digits);
      for (const { cents, n } of cases(4880 + digits, 500)) {
        const out = (expand(cents / 100, n, digits) ?? []).map(amountCents);
        expect(out).toHaveLength(n);
        expect(out.reduce((sum, c) => sum + c, 0)).toBe(cents);
        expect(out.slice(0, -1).every((c) => c % unit === 0 && c >= 0)).toBe(true);
        expect(out[n - 1]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
