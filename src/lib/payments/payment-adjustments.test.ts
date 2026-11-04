import vectors from './payment-adjustment-vectors.json';
import { roundingDigits } from '@/lib/money/line-rounding';
import { moneyWithCode } from '@/lib/format/sede-number';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock } from '@/lib/test/sede-clock';
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

  it('pinta el cálculo y el importe con signo con el formato de la sede (DX-354b)', () => {
    const caracas = stampPainters(testAgendaClock([STAMP_SEDES.caracas, STAMP_SEDES.berlin])).money;
    const berlin = stampPainters(testAgendaClock([STAMP_SEDES.berlin, STAMP_SEDES.caracas])).money;
    const fixed = { calculation: 'FIXED', percent: null, fixedAmount: 1234.5, fixedCurrency: 'VES' } as const;
    expect(percentText(7.5)).toBe('7,5 %');
    expect(adjustmentCalculationText({ calculation: 'PERCENT', percent: 3, fixedAmount: null, fixedCurrency: null }, caracas)).toBe('3 %');
    expect(adjustmentCalculationText(fixed, caracas)).toBe(moneyWithCode(1234.5, 'VES', STAMP_FORMATS.caracas));
    expect(adjustmentCalculationText(fixed, berlin)).toBe(moneyWithCode(1234.5, 'VES', STAMP_FORMATS.berlin));
    expect(adjustmentCalculationText(fixed, caracas)).toBe('VES\u00a01.234,50');
    expect(adjustmentCalculationText(fixed, berlin)).toBe('1.234,50\u00a0VES');
    expect(signedAdjustmentAmount({ type: 'DISCOUNT', amount: 5, currency: 'USD' }, caracas)).toBe('−USD\u00a05,00');
    expect(signedAdjustmentAmount({ type: 'TAX', amount: 3, currency: 'USD' }, berlin)).toBe('+3,00\u00a0USD');
  });
});
