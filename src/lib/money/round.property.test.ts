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
});
