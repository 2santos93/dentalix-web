import cases from './currency-text.cases.json';
import { formatCurrency } from './currency';
import { moneyWithCode, sedeMoney } from './sede-number';
import { regionalFormat } from './regional-format';
import { parseMoneyInput } from './money';
import { clinicCurrencyTexts, setClinicCurrencyTexts } from './clinic-currency-texts';
import { NO_CURRENCY_TEXTS, currencyTextFor, isCurrencyText, moneyWithCurrencyText } from './currency-text';

/**
 * DX-517: vectores COMPARTIDOS con la API (`src/shared/format/currency-text.cases.json`,
 * copia byte a byte: `scripts/check-api-reference-sync.mjs`). Los dos helpers
 * de la web (y `fmt.money` de la API) dan el mismo texto con un texto propio.
 */
describe('texto propio de cada moneda (DX-517)', () => {
  afterEach(() => setClinicCurrencyTexts({}));

  it.each(cases.map((c) => [`${c.locale} ${c.amount} ${c.currency}`, c] as const))('vector %s', (_name, c) => {
    const texts = c.texts as unknown as Record<string, string>;
    expect(formatCurrency(c.amount, c.currency, c.locale, texts)).toBe(c.expected);
    expect(moneyWithCode(c.amount, c.currency, regionalFormat({ locale: c.locale, hourCycle: 'h23' }), texts)).toBe(
      c.expected,
    );
    expect(moneyWithCurrencyText(c.amount, c.currency.toUpperCase(), c.locale, currencyTextFor(texts, c.currency)!)).toBe(
      c.expected,
    );
  });

  it('el criterio: «VES → Bs.» en es-VE es «Bs. 1.234,50»', () => {
    const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
    expect(moneyWithCode(1234.5, 'VES', fmt, { VES: 'Bs.' })).toBe('Bs.\u00a01.234,50');
  });

  it('sin configurar, ambos helpers dan exactamente lo de antes (código ISO)', () => {
    expect(clinicCurrencyTexts()).toBe(NO_CURRENCY_TEXTS);
    const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
    expect(formatCurrency(450, 'USD')).toBe('450,00\u00a0USD');
    expect(formatCurrency(1234.5, 'VES', 'es')).toBe('1234,50\u00a0VES');
    expect(moneyWithCode(1234.5, 'VES', fmt)).toBe('VES\u00a01.234,50');
    // Un texto de OTRA moneda no toca esta.
    expect(formatCurrency(450, 'USD', 'es', { VES: 'Bs.' })).toBe('450,00\u00a0USD');
    expect(moneyWithCode(1234.5, 'USD', fmt, { VES: 'Bs.' })).toBe(moneyWithCode(1234.5, 'USD', fmt));
  });

  it('los ~170 sitios que pintan importes toman el de la clínica sin enhebrarlo', () => {
    const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
    setClinicCurrencyTexts({ VES: 'Bs.' });
    expect(moneyWithCode(1234.5, 'VES', fmt)).toBe('Bs.\u00a01.234,50');
    expect(sedeMoney(1234.5, 'VES', fmt)).toBe('Bs.\u00a01.234,50');
    expect(formatCurrency(1234.5, 'VES', 'es-VE')).toBe('Bs.\u00a01.234,50');
    // Un recibo emitido sin textos los pasa vacíos y se pinta como cuando se emitió.
    expect(formatCurrency(1234.5, 'VES', 'es-VE', NO_CURRENCY_TEXTS)).toBe('VES\u00a01.234,50');
    expect(sedeMoney(1234.5, 'VES', null)).toBe('—');
  });

  it('lo que no es un mapa válido se ignora al fijarlo', () => {
    setClinicCurrencyTexts({ VES: 'Bs.', usd: 'US$', EUR: ' € ', GBP: 'Libras esterlinas' });
    expect(clinicCurrencyTexts()).toEqual({ VES: 'Bs.' });
    setClinicCurrencyTexts('VES');
    expect(clinicCurrencyTexts()).toEqual({});
  });

  it.each([
    ['Bs.', true],
    ['ABCDEFGH', true],
    ['', false],
    [' Bs.', false],
    ['ABCDEFGHI', false],
    ['B\ns', false],
    ['B\u200es', false],
  ])('isCurrencyText(%j) = %s', (text, ok) => expect(isCurrencyText(text)).toBe(ok));
});

describe('un importe pegado con el texto propio de la clínica se lee (DX-517)', () => {
  afterEach(() => setClinicCurrencyTexts({}));

  it('«Bs. 1.234,50» en un campo en VES es 1234,5; en otro de USD, no se entiende', () => {
    setClinicCurrencyTexts({ VES: 'Bs.' });
    expect(parseMoneyInput('Bs.\u00a01.234,50', 'VES')).toEqual({ ok: true, value: 1234.5 });
    expect(parseMoneyInput('1.234,50 Bs.', 'VES')).toEqual({ ok: true, value: 1234.5 });
    expect(parseMoneyInput('Bs. 1.234,50', 'USD').ok).toBe(false);
  });
});
