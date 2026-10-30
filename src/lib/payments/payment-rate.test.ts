import { regionalFormat } from '@/lib/format/regional-format';
import { convertWithRate, frozenRateLabel, paymentRateCopy, quoteFromRates } from './payment-rate';
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

// Sede del test, explícita: el formato sale de la sede (DX-378), nunca de un idioma fijo.
const ES_CO = regionalFormat({ locale: 'es-CO', hourCycle: 'h12' });

describe('frozenRateLabel (DX-375)', () => {
  it('dice cuántas unidades de la moneda menor vale 1 de la mayor, la fuente y el día', () => {
    expect(frozenRateLabel(frozen(), ES_CO)?.replace(/\s/g, ' ')).toBe(
      'Tasa congelada: 1 USD = COP 4.000,00 · automática · 30/10/2026',
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
      }, ES_CO)?.replace(/\s/g, ' '),
    ).toBe('Tasa congelada: 1 USD = COP 4.100,00 · manual · 30/10/2026');
  });

  it('una tasa cruzada sale de las dos tasas congeladas', () => {
    expect(frozenRateLabel(frozen({ currency: 'EUR', toPerBase: 0.8 }), ES_CO)?.replace(/\s/g, ' ')).toMatch(
      /1 EUR = COP 5\.000,00/,
    );
  });

  it('sin tasa congelada no hay etiqueta', () => {
    expect(frozenRateLabel({ currency: 'COP', frozenRate: null }, ES_CO)).toBeNull();
  });

  it('con el formato de otra sede y siempre el código ISO, nunca un símbolo (DX-378)', () => {
    const label = frozenRateLabel(frozen(), regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }));
    expect(label?.replace(/\s/g, ' ')).toBe('Tasa congelada: 1 USD = 4.000,00 COP · automática · 30.10.2026');
    expect(label).not.toMatch(/\$/);
  });

  it('sin el formato de la sede, «—» en lugar de la cifra y del día: nunca otro formato', () => {
    expect(frozenRateLabel(frozen(), null)).toBe('Tasa congelada: 1 USD = — · automática · —');
  });

  it('los textos no nombran un país ni un banco central', () => {
    expect(JSON.stringify(paymentRateCopy)).not.toMatch(/venezuela|colombia|banco central|bcv/i);
  });
});

describe('quoteFromRates (DX-376: la misma tasa que congela la API)', () => {
  const day = (rates: Record<string, number>) => ({ base: 'USD', rates });

  it('redondea las tasas a 8 decimales, lo que guarda la columna al congelar (DX-375)', () => {
    // Con un fallo de la caché el proveedor puede dar más decimales: la API los
    // recorta a 8 antes de convertir, así que la previsualización también.
    const quote = quoteFromRates(day({ VES: 36.123456789 }), 'VES', 'USD');
    expect(quote).toEqual({ currency: 'USD', fromPerBase: 36.12345679, toPerBase: 1 });
  });

  it('el equivalente con esa tasa coincide céntimo a céntimo con el que congela la API', () => {
    // La API convierte con 0,12345678 (8 decimales): 10.000 → 81.000,01. Con la
    // tasa cruda saldría 81.000,00: un céntimo distinto del que se guarda.
    const quote = quoteFromRates(day({ XAU: 0.123456785 }), 'XAU', 'USD');
    expect(convertWithRate(10000, quote!)).toBe(81000.01);
  });

  it('la moneda base vale 1 aunque no venga en `rates`', () => {
    expect(quoteFromRates(day({ COP: 4000 }), 'COP', 'USD')).toEqual({ currency: 'USD', fromPerBase: 4000, toPerBase: 1 });
    expect(quoteFromRates(day({ COP: 4000 }), 'USD', 'COP')).toEqual({ currency: 'COP', fromPerBase: 1, toPerBase: 4000 });
  });

  it('una moneda ausente, o una tasa que redondea a 0 con 8 decimales, es «sin tasa» (como la API)', () => {
    expect(quoteFromRates(day({ COP: 4000 }), 'VES', 'USD')).toBeNull();
    expect(quoteFromRates(day({ XYZ: 0.000000001 }), 'XYZ', 'USD')).toBeNull();
  });
});
