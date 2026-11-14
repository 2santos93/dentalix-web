import { differenceText, hasVisibleDifference } from './presentation';

const usd = (amount: number) => `USD ${amount}`;
const money = (amount: number, currency: string) => `${currency} ${amount}`;

describe('diferencia de un turno (SEC-043)', () => {
  it('«Cuadra» si todo es 0; las distintas de 0, con su cifra', () => {
    expect(differenceText([{ currency: 'USD', amount: 0 }], money)).toBe('Cuadra');
    expect(differenceText([{ currency: 'USD', amount: -5 }], money)).toBe(usd(-5));
  });

  it('una moneda oculta durante el arqueo nunca dice «Cuadra» ni da cifra', () => {
    expect(differenceText([{ currency: 'USD', amount: null }], money)).toBe('Oculto durante el arqueo');
    expect(
      differenceText(
        [
          { currency: 'USD', amount: null },
          { currency: 'VES', amount: -10 },
        ],
        money,
      ),
    ).toBe('VES -10 · Oculto durante el arqueo (USD)');
  });

  it('solo una diferencia visible distinta de 0 pinta en rojo', () => {
    expect(hasVisibleDifference([{ amount: null }])).toBe(false);
    expect(hasVisibleDifference([{ amount: 0 }, { amount: -1 }])).toBe(true);
  });
});
