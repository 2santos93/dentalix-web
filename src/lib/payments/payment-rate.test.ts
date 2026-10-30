import { frozenRateLabel, paymentRateCopy } from './payment-rate';
import type { Payment } from './payments-api';

const frozen = (over: Partial<NonNullable<Payment['frozenRate']>> = {}): Pick<Payment, 'currency' | 'frozenRate'> => ({
  currency: 'COP',
  frozenRate: {
    currency: 'USD',
    fromPerBase: 4000,
    toPerBase: 1,
    source: 'AUTOMATIC',
    date: '2026-10-30',
    ...over,
  },
});

describe('frozenRateLabel (DX-375)', () => {
  it('dice cuántas unidades de la moneda menor vale 1 de la mayor, la fuente y el día', () => {
    // `formatCurrency` en español no agrupa los miles de un número de 4 cifras.
    expect(frozenRateLabel(frozen())?.replace(/\s/g, ' ')).toMatch(
      /^Tasa congelada: 1 USD = 4\.?000,00 COP · automática · 30\/10\/2026$/,
    );
  });

  it('al revés cuando el abono está en la moneda mayor', () => {
    expect(
      frozenRateLabel({
        currency: 'USD',
        frozenRate: {
          currency: 'COP',
          fromPerBase: 1,
          toPerBase: 4100,
          source: 'MANUAL',
          date: '2026-10-30',
        },
      })?.replace(/\s/g, ' '),
    ).toMatch(/^Tasa congelada: 1 USD = 4\.?100,00 COP · manual · 30\/10\/2026$/);
  });

  it('una tasa cruzada sale de las dos tasas congeladas', () => {
    expect(frozenRateLabel(frozen({ currency: 'EUR', toPerBase: 0.8 }))?.replace(/\s/g, ' ')).toMatch(
      /1 EUR = 5\.?000,00 COP/,
    );
  });

  it('sin tasa congelada no hay etiqueta', () => {
    expect(frozenRateLabel({ currency: 'COP', frozenRate: null })).toBeNull();
  });

  it('los textos no nombran un país ni un banco central', () => {
    expect(JSON.stringify(paymentRateCopy)).not.toMatch(/venezuela|colombia|banco central|bcv/i);
  });
});
