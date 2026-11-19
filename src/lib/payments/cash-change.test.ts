import { changeEquivalent, settleCashChange, suggestedChange } from './cash-change';
import { floorToDigits } from '@/lib/money/line-rounding';

// DX-570: la misma cuenta que la API, en céntimos de la moneda del abono.
const RATES = { base: 'USD', rates: { VES: 36.5, JPY: 150 } };

describe('vuelto en otra moneda (DX-570)', () => {
  it('45 USD con 50 recibidos: 5 USD en VES son 182,50 VES y equivalen a 5,00 USD', () => {
    expect(suggestedChange(5, 'VES', 'USD', RATES, 2)).toBe(182.5);
    const eq = changeEquivalent(182.5, 'VES', 'USD', RATES);
    expect(eq).toMatchObject({ status: 'ready', amount: 5 });
    expect(
      settleCashChange({ tendered: 50, collected: 45, equivalents: [eq] }),
    ).toEqual({ kind: 'ok', due: 5, change: 5, remainder: 0 });
  });

  it('la sugerencia se redondea hacia abajo y nunca se pasa de lo debido', () => {
    const odd = { base: 'USD', rates: { VES: 36.4321 } };
    const s = suggestedChange(5, 'VES', 'USD', odd, 2);
    expect(s).toBe(182.16);
    const eq = changeEquivalent(s as number, 'VES', 'USD', odd);
    expect(eq.status === 'ready' && eq.amount <= 5).toBe(true);
    // Moneda sin decimales: unidades enteras hacia abajo.
    expect(suggestedChange(5.01, 'JPY', 'USD', RATES, 0)).toBe(751);
    expect(floorToDigits(182.4999999999, 2)).toBe(182.5);
  });

  it('vuelto mayor que lo debido, diferencia sin devolver y recibido corto', () => {
    const eq = (amount: number) => changeEquivalent(amount, 'USD', 'USD', RATES);
    expect(settleCashChange({ tendered: 50, collected: 45, equivalents: [eq(5.01)] })).toEqual({
      kind: 'exceeds',
      due: 5,
      change: 5.01,
    });
    expect(settleCashChange({ tendered: 50, collected: 45, equivalents: [eq(3)] })).toEqual({
      kind: 'ok',
      due: 5,
      change: 3,
      remainder: 2,
    });
    expect(settleCashChange({ tendered: 40, collected: 45, equivalents: [] })).toEqual({
      kind: 'below-collected',
      collected: 45,
    });
  });

  it('sin tasa o sin lo cobrado no se adivina', () => {
    expect(changeEquivalent(10, 'EUR', 'USD', RATES)).toEqual({ status: 'unavailable' });
    expect(changeEquivalent(10, 'VES', 'USD', 'loading')).toEqual({ status: 'loading' });
    expect(suggestedChange(5, 'VES', 'USD', 'unavailable', 2)).toBeNull();
    expect(settleCashChange({ tendered: 50, collected: null, equivalents: [] })).toEqual({ kind: 'pending' });
    expect(settleCashChange({ tendered: null, collected: 45, equivalents: [] })).toEqual({ kind: 'empty' });
  });
});
