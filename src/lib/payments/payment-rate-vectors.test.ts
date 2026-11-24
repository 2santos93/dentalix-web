import vectorsJson from './payment-rate-vectors.json';
import { balanceAfterPayment, convertWithRate, quoteFromRates } from './payment-rate';

// DX-398 (TST-050): paridad con la API. `payment-rate-vectors.json` es copia
// byte a byte de `dentalix-api/src/modules/payments/application/payment-rate-vectors.json`
// (lo vigila `scripts/check-api-reference-sync.mjs`); la API corre los mismos
// vectores en `payment-rate-vectors.spec.ts` con `freezePaymentRate`,
// `paymentAmountIn` y `PlanBalanceCalculator`. Aquí, con el código de la
// previsualización del cobro (`payment-rate-preview.tsx`): la tasa del día
// recortada a 8 decimales (`quoteFromRates`), el equivalente
// (`convertWithRate`) y lo pendiente tras el abono (`balanceAfterPayment`).

interface Vector {
  name: string;
  amount: number;
  from: string;
  to: string;
  ratesPerUsd: Record<string, number>;
  pendingBefore: number;
  rate: { fromPerBase: number; toPerBase: number } | null;
  equivalent: number | null;
  pendingAfter: number | null;
}

const vectors = vectorsJson as unknown as { version: number; base: string; conversions: Vector[] };

describe('vectores del abono en otra moneda compartidos con la API (DX-398)', () => {
  it('versión y base de los vectores', () => {
    expect(vectors.version).toBe(1);
    expect(vectors.base).toBe('USD');
  });

  it.each(vectors.conversions)('$name: $amount $from → $to', (v) => {
    const quote = quoteFromRates({ base: vectors.base, rates: v.ratesPerUsd }, v.from, v.to);
    expect(quote && { fromPerBase: quote.fromPerBase, toPerBase: quote.toPerBase }).toEqual(v.rate);
    if (quote === null) {
      // «Sin tasa»: la previsualización no enseña equivalente ni pendiente.
      expect(v.equivalent).toBeNull();
      expect(v.pendingAfter).toBeNull();
      return;
    }
    const equivalent = convertWithRate(v.amount, quote);
    expect(equivalent).toBe(v.equivalent);
    expect(balanceAfterPayment(v.pendingBefore, equivalent)).toBe(v.pendingAfter);
  });
});
