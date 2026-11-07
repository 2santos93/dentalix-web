import { regionalFormat } from '@/lib/format/regional-format';
import { referenceInPlan } from './discount-rules';
import { referenceRateMissingText, referenceRateText } from './reference-rate';

// DX-513-bis: espejo de la referencia en la moneda del plan y el texto de la
// tasa congelada («unidades por 1 USD» de cada moneda que no es USD).
const ES_VE = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });

describe('referenceInPlan (DX-513-bis, espejo de la API)', () => {
  const crown = {
    catalogPrice: 3600,
    catalogCurrency: 'VES',
    priceSource: 'CATALOG',
  };

  it('con foto: la referencia convertida', () => {
    expect(referenceInPlan({ ...crown, referencePriceInPlan: 4.09 }, 'USD')).toBe(4.09);
  });

  it('sin foto: la regla de DX-513 (otra moneda conocida: null; misma o desconocida: catalogPrice)', () => {
    expect(referenceInPlan({ ...crown, referencePriceInPlan: null }, 'USD')).toBeNull();
    expect(referenceInPlan({ ...crown, referencePriceInPlan: null }, 'VES')).toBe(3600);
    expect(referenceInPlan({ ...crown, catalogCurrency: null }, 'USD')).toBe(3600);
  });
});

describe('referenceRateText', () => {
  const day = ES_VE.civilDate('2026-11-07');

  it('VES → USD: «tasa 1 USD = 880 VES del <día>, manual» (la moneda fuerte a la izquierda)', () => {
    expect(
      referenceRateText({ fromPerBase: 880, toPerBase: 1, source: 'MANUAL', rateDate: '2026-11-07' }, 'VES', 'USD', ES_VE),
    ).toBe(`tasa 1 USD = 880 VES del ${day}, manual`);
  });

  it('USD → VES con decimales: el mismo par, automática', () => {
    expect(
      referenceRateText({ fromPerBase: 1, toPerBase: 880.5, source: 'AUTOMATIC', rateDate: '2026-11-07' }, 'USD', 'VES', ES_VE),
    ).toBe(`tasa 1 USD = ${ES_VE.number(880.5, { min: 0, max: 4 })} VES del ${day}, automática`);
  });

  it('cruzada (VES → EUR, por USD): el par directo 1 EUR = 500 VES', () => {
    expect(
      referenceRateText({ fromPerBase: 400, toPerBase: 0.8, source: 'MANUAL', rateDate: '2026-11-07' }, 'VES', 'EUR', ES_VE),
    ).toBe(`tasa 1 EUR = 500 VES del ${day}, manual`);
  });

  it('sin formato de la sede: «—» en las cifras (nunca otro formato)', () => {
    expect(
      referenceRateText({ fromPerBase: 880, toPerBase: 1, source: 'MANUAL', rateDate: '2026-11-07' }, 'VES', 'USD', null),
    ).toBe('tasa 1 USD = — VES del —, manual');
  });
});

describe('referenceRateMissingText', () => {
  it('nombra la moneda que falta y las dos salidas', () => {
    expect(referenceRateMissingText('VES', 'USD')).toBe(
      'No hay tasa de VES para hoy: regístrala en Ajustes › Tasa de cambio o usa una lista de precios en USD.',
    );
  });
});
