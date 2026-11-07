import { convertWithRate } from '@/lib/payments/payment-rate';
import { collectedAmount } from '@/lib/payments/payment-adjustments';
import { effectiveDiscount } from '@/lib/discounts/discount-rules';
import { excessOverPending, splitTotalOf } from '@/components/payments/split-payment-lines';
import { overdueOf } from '@/components/dashboard/inicio-api';
import { moneyInputText } from '@/lib/format/money';
import { linesTotal, lineCents, unitsToAmount, unitCents, type RoundingDigits } from './line-rounding';
import { amountCents, amountText, centsToAmount, roundAmount, roundCents } from './round';

/**
 * DX-488-bis: el helper único da EXACTAMENTE lo mismo que la expresión suelta
 * que sustituyó en cada sitio. Se compara con la expresión antigua copiada tal
 * cual, sobre empates de coma flotante (1,005 · 2,675), negativos, cero, enteros,
 * importes grandes, ruido de suma (0,1 + 0,2) y 60 000 valores pseudoaleatorios
 * con semilla fija (sin dependencias: mulberry32).
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samples(): number[] {
  const out: number[] = [
    0, -0, 1.005, 2.675, 1.255, 8.345, 0.285, 1.115, -1.005, -2.675, 0.1 + 0.2, 0.07 * 100, 4.35, 1e6 + 0.005,
    99999999.99, 150000.5, 0.001, -0.001, 0.005, -0.005, 0.015, 0.025, 0.035, 1234567.895, 1, 100, -100, 0.5, 80.5, 18.5,
  ];
  // Empates exactos de céntimo: k + 0,005 con k en céntimos, positivos y negativos.
  for (let k = -300; k <= 300; k++) out.push(k / 100 + 0.005, k / 1000, k + 0.5);
  const rand = mulberry32(488);
  for (let i = 0; i < 20000; i++) {
    out.push(rand() * 1000);
    out.push(-rand() * 1000);
    out.push(Math.round(rand() * 1e7) / 1000); // tres decimales: muchos empates
  }
  return out;
}
const VALUES = samples();

// Expresiones antiguas, copiadas de cada sitio antes de la migración.
const old = {
  round2: (n: number) => Math.round(n * 100) / 100, // create-payment-plan-modal, payment-rate-preview, inicio-api, balances-step, money.ts moneyInputText, split-payment-lines, payment-rate convertWithRate
  toCents: (n: number) => Math.round(n * 100), // reallocate-payment-modal, arqueo, discount-rules, record-payment/expense/credit modals, payment-adjustments
  toFixed: (n: number, d: number) => n.toFixed(d), // currency.ts respaldo de Intl
};

describe('DX-488-bis: el helper único es idéntico a los redondeos sueltos que sustituye', () => {
  it('hay valores de sobra y los empates clásicos están dentro', () => {
    expect(VALUES.length).toBeGreaterThan(60000);
    expect(VALUES).toEqual(expect.arrayContaining([1.005, 2.675, -1.005, -2.675]));
  });

  it('amountCents == Math.round(x * 100)', () => {
    for (const v of VALUES) expect(Object.is(amountCents(v), old.toCents(v))).toBe(true);
  });

  it('roundAmount == Math.round(x * 100) / 100', () => {
    for (const v of VALUES) expect(Object.is(roundAmount(v), old.round2(v))).toBe(true);
  });

  it('centsToAmount == cents / 100, y ida y vuelta == roundAmount', () => {
    for (const v of VALUES) {
      const c = old.toCents(v);
      expect(Object.is(centsToAmount(c), c / 100)).toBe(true);
      expect(Object.is(centsToAmount(amountCents(v)), roundAmount(v))).toBe(true);
    }
  });

  it('roundCents == Math.round (suma de importe × 100 de audit-labels)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const lines = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => ({ amount: Math.round(rand() * 1e5) / 100 }));
      const before = Math.round(lines.reduce((sum, l) => sum + l.amount * 100, 0)) / 100;
      const after = centsToAmount(roundCents(lines.reduce((sum, l) => sum + l.amount * 100, 0)));
      expect(Object.is(after, before)).toBe(true);
    }
  });

  it('amountText == toFixed con 0, 1 y 2 dígitos (monedas sin decimales incluidas)', () => {
    for (const v of VALUES.slice(0, 20000)) for (const d of [0, 1, 2]) expect(amountText(v, d)).toBe(old.toFixed(v, d));
    expect(amountText(1.005, 2)).toBe('1.00');
    expect(amountText(2.675, 2)).toBe('2.67');
    expect(amountText(1234, 0)).toBe('1234');
    expect(amountText(150000.5, 0)).toBe('150001');
  });

  it('los empates concretos (USD/VES): la mitad hacia arriba sobre importe × 100', () => {
    expect(amountCents(1.005)).toBe(100); // 1,005 × 100 = 100,49999… en coma flotante
    expect(amountCents(2.675)).toBe(268);
    expect(roundAmount(0.1 + 0.2)).toBe(0.3);
    expect(amountCents(-2.675)).toBe(-267); // Math.round: hacia +∞ en el empate
    expect(roundAmount(36.5)).toBe(36.5);
  });

  it('las comparaciones de los modales dan lo mismo (importe digitado frente a pendiente)', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 20000; i++) {
      const a = Math.round(rand() * 1e5) / 100 + (rand() < 0.3 ? 0.001 : 0);
      const b = Math.round(rand() * 1e5) / 100;
      expect(amountCents(a) > amountCents(b)).toBe(Math.round(a * 100) > Math.round(b * 100));
      expect(amountCents(a) < amountCents(b)).toBe(Math.round(a * 100) < Math.round(b * 100));
    }
  });

  // Código anterior de cada función migrada, copiado tal cual de origin/main (3abbef88).
  describe('funciones migradas frente a su código anterior (verbatim de origin/main)', () => {
    const pool = VALUES.filter((_, i) => i % 7 === 0);
    const adjustmentSign = (type: string) => (type === 'DISCOUNT' ? -1 : 1);

    it('unitsToAmount', () => {
      const HUNDRED = BigInt(100);
      const oldUnitsToAmount = (units: bigint, digits: RoundingDigits) =>
        Number(units * unitCents(digits)) / Number(HUNDRED);
      const rand = mulberry32(11);
      for (let i = 0; i < 5000; i++) {
        const units = BigInt(Math.floor((rand() - 0.3) * 1e9));
        for (const d of [0, 1, 2] as const) expect(Object.is(unitsToAmount(units, d), oldUnitsToAmount(units, d))).toBe(true);
      }
    });

    it('lineCents y linesTotal', () => {
      const oldLineCents = (l: { price: number; discount: number }) =>
        Math.round(l.price * 100) - Math.round(l.discount * 100);
      const oldLinesTotal = (ls: { price: number; discount: number }[]) =>
        ls.reduce((sum, l) => sum + oldLineCents(l), 0) / 100;
      const rand = mulberry32(12);
      for (let i = 0; i < 5000; i++) {
        const lines = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => ({
          price: Math.round(rand() * 1e6) / 1000,
          discount: Math.round(rand() * 1e5) / 1000,
        }));
        expect(Object.is(linesTotal(lines), oldLinesTotal(lines))).toBe(true);
        expect(Object.is(lineCents(lines[0]), oldLineCents(lines[0]))).toBe(true);
      }
    });

    it('convertWithRate', () => {
      const old = (amount: number, r: { fromPerBase: number; toPerBase: number }) =>
        Math.round((amount / r.fromPerBase) * r.toPerBase * 100) / 100;
      const rand = mulberry32(13);
      for (const v of pool) {
        const rate = { fromPerBase: 0.5 + rand() * 40, toPerBase: 0.5 + rand() * 40 };
        expect(Object.is(convertWithRate(v, rate), old(v, rate))).toBe(true);
      }
      expect(Object.is(convertWithRate(100, { fromPerBase: 1, toPerBase: 36.5 }), old(100, { fromPerBase: 1, toPerBase: 36.5 }))).toBe(true);
    });

    it('excessOverPending', () => {
      const old = (total: number, pending: number) =>
        Math.max(0, Math.round(total * 100) - Math.max(0, Math.round(pending * 100))) / 100;
      const rand = mulberry32(14);
      for (const v of pool) {
        const pending = Math.round((rand() - 0.2) * 1e5) / 100;
        expect(Object.is(excessOverPending(v, pending), old(v, pending))).toBe(true);
      }
    });

    it('splitTotalOf (líneas en la moneda del plan)', () => {
      const old = (lines: { amount: number | null }[]) => {
        let cents = 0;
        for (const line of lines) {
          if (line.amount === null) continue;
          cents += Math.round(line.amount * 100);
        }
        return cents / 100;
      };
      const rand = mulberry32(15);
      for (let i = 0; i < 3000; i++) {
        const lines = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => ({
          amount: rand() < 0.1 ? null : Math.round(rand() * 1e6) / 1000,
          currency: 'USD',
        }));
        const got = splitTotalOf(lines, 'USD', { status: 'idle' } as never);
        expect(got).toEqual({ status: 'ready', total: old(lines) });
      }
    });

    it('collectedAmount', () => {
      const old = (amount: number, lines: { type: string; amount: number }[]) => {
        const cents = lines.reduce((sum, l) => sum + adjustmentSign(l.type) * Math.round(l.amount * 100), Math.round(amount * 100));
        return cents / 100;
      };
      const types = ['TAX', 'SURCHARGE', 'DISCOUNT'] as const;
      const rand = mulberry32(16);
      for (let i = 0; i < 5000; i++) {
        const lines = Array.from({ length: Math.floor(rand() * 4) }, () => ({
          type: types[Math.floor(rand() * 3)],
          amount: Math.round(rand() * 1e5) / 1000,
        }));
        const amount = Math.round(rand() * 1e6) / 1000;
        expect(Object.is(collectedAmount(amount, lines as never), old(amount, lines))).toBe(true);
      }
    });

    it('effectiveDiscount', () => {
      const cents = (a: number) => BigInt(Math.round(a * 100));
      const old = (catalog: number | null | undefined, price: number, discount: number) => {
        const priceCents = cents(price);
        const catalogCents = catalog == null ? null : cents(catalog);
        const reduction = catalogCents !== null && catalogCents > priceCents ? catalogCents - priceCents : BigInt(0);
        return {
          listPrice: Number(priceCents + reduction) / 100,
          priceReduction: Number(reduction) / 100,
          total: Number(reduction + cents(discount)) / 100,
        };
      };
      const rand = mulberry32(17);
      for (let i = 0; i < 5000; i++) {
        const price = Math.round(rand() * 1e6) / 1000;
        const catalog = rand() < 0.2 ? null : Math.round(rand() * 1e6) / 1000;
        const discount = Math.round(rand() * 1e5) / 1000;
        expect(effectiveDiscount(catalog, price, discount)).toEqual(old(catalog, price, discount));
      }
    });

    it('overdueOf y moneyInputText', () => {
      const rand = mulberry32(18);
      for (let i = 0; i < 5000; i++) {
        const [a, b, c, d] = [0, 0, 0, 0].map(() => Math.round(rand() * 1e6) / 100 + (rand() < 0.3 ? 0.001 : 0));
        const buckets = { days0to30: a, days31to60: b, days61to90: c, over90: d };
        expect(Object.is(overdueOf({ buckets } as never), Math.round((a + b + c + d) * 100) / 100)).toBe(true);
      }
      for (const v of pool) expect(moneyInputText(v)).toBe(String(Math.round(v * 100) / 100).replace('.', ','));
    });
  });

  it('límite de 2 decimales: round.ts redondea siempre a céntimos; las monedas de 0 decimales no son su ámbito', () => {
    // Un importe en una moneda sin decimales (p. ej. JPY 1234,5) sigue cayendo a céntimos:
    // el redondeo a unidades enteras lo hace `line-rounding` con los `roundingDigits` del contrato.
    expect(roundAmount(1234.5)).toBe(1234.5);
    expect(roundAmount(1234.567)).toBe(1234.57);
    expect(amountCents(1234.5)).toBe(123450);
    expect(centsToAmount(amountCents(0.005))).toBe(0.01);
    expect(roundAmount.length).toBe(1); // sin parámetro de dígitos: a propósito
    expect(amountCents.length).toBe(1);
    expect(amountText(1234.5, 0)).toBe('1235'); // toFixed: solo los dígitos de FORMATO los decide quien llama
  });
});
