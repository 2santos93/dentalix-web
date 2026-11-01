import vectors from './payment-adjustment-vectors.json';
import { roundingDigits } from '@/lib/money/line-rounding';
import {
  adjustmentCalculationText,
  collectedAmount,
  computePaymentAdjustments,
  percentText,
  signedAdjustmentAmount,
  type AdjustmentRule,
  type PaymentAdjustmentType,
} from './payment-adjustments';

// DX-516: paridad con la API. `payment-adjustment-vectors.json` es copia byte
// a byte de `dentalix-api/src/modules/payment-methods/domain/payment-adjustment-vectors.json`
// (lo vigila scripts/check-api-reference-sync.mjs).

type Vectors = {
  currencies: Record<string, { roundingDigits: number }>;
  cases: {
    name: string;
    amount: number;
    currency: string;
    rules: AdjustmentRule[];
    lines: { type: PaymentAdjustmentType; label: string; amount: number }[];
    collected: number;
  }[];
};
const data = vectors as unknown as Vectors;

describe('ajustes por medio de pago (DX-516)', () => {
  it.each(data.cases.map((c) => [c.name, c] as const))('vector: %s', (_name, c) => {
    const lines = computePaymentAdjustments(
      c.rules,
      c.amount,
      c.currency,
      roundingDigits(data.currencies[c.currency].roundingDigits),
    );
    expect(lines.map((l) => ({ type: l.type, label: l.label, amount: l.amount }))).toEqual(c.lines);
    expect(collectedAmount(c.amount, lines)).toBe(c.collected);
  });

  it('pinta el cálculo y el importe con signo', () => {
    expect(percentText(7.5)).toBe('7,5 %');
    expect(adjustmentCalculationText({ calculation: 'PERCENT', percent: 3, fixedAmount: null, fixedCurrency: null })).toBe('3 %');
    expect(adjustmentCalculationText({ calculation: 'FIXED', percent: null, fixedAmount: 2, fixedCurrency: 'USD' })).toMatch(/2,00/);
    expect(signedAdjustmentAmount({ type: 'DISCOUNT', amount: 5, currency: 'USD' })).toMatch(/^−5,00/);
    expect(signedAdjustmentAmount({ type: 'TAX', amount: 3, currency: 'USD' })).toMatch(/^\+3,00/);
  });
});
