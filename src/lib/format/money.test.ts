import { formatCurrency } from './currency';
import { MONEY_INPUT_MAX, moneyInputCopy, moneyInputText, parseDecimalInput, parseMoneyInput } from './money';

function value(text: string, currency: string): number | null {
  const result = parseMoneyInput(text, currency);
  return result.ok ? result.value : null;
}

describe('parseMoneyInput (DX-241)', () => {
  // La tabla de casos de la tarea: el último separador seguido de 1–2 cifras es
  // el decimal; los miles van en grupos de 3 con punto, coma o espacio.
  it.each([
    ['150.50', 'USD', 150.5],
    ['150,50', 'USD', 150.5],
    ['150.000', 'COP', 150000],
    ['1.500.000,25', 'USD', 1500000.25],
    ['1,500.25', 'USD', 1500.25],
  ])('«%s» (%s) → %d', (text, currency, expected) => {
    expect(value(text, currency)).toBe(expected);
  });

  it('«1.50.0» es ambiguo y dice por qué', () => {
    const result = parseMoneyInput('1.50.0', 'USD');
    expect(result).toEqual({ ok: false, reason: 'ambiguous', message: moneyInputCopy.ambiguous('1.50.0') });
  });

  it.each([
    ['150000', 'COP', 150000],
    ['150', 'USD', 150],
    ['0', 'COP', 0],
    ['0,5', 'USD', 0.5],
    ['1,5', 'EUR', 1.5],
    ['150,000', 'COP', 150000],
    ['150.000', 'USD', 150000],
    ['1 500 000,25', 'EUR', 1500000.25],
    ['1 500 000', 'COP', 1500000],
    ['  80.000  ', 'COP', 80000],
    ['1.234.567', 'COP', 1234567],
    ['12,345', 'USD', 12345],
    ['007', 'COP', 7],
    ['1500,50', 'USD', 1500.5],
  ])('«%s» (%s) → %d', (text, currency, expected) => {
    expect(value(text, currency)).toBe(expected);
  });

  it.each([
    '1.50.0',
    '1.500,000',
    '1,500,25.5',
    '1.500.25',
    '15.00.000',
    '1,2345',
    '0.500',
    '150.',
    '.',
    '1 50',
    '1 500.000',
  ])('«%s» es ambiguo', (text) => {
    expect(parseMoneyInput(text, 'USD')).toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it.each(['abc', '150$5', '1e5', '15O', '-abc', '1-50'])('«%s» no es un importe', (text) => {
    expect(parseMoneyInput(text, 'USD')).toEqual({
      ok: false,
      reason: 'invalid',
      message: moneyInputCopy.invalid,
    });
  });

  // Revisión DX-241 (2.ª pasada): en el ajuste de caja es natural teclear
  // «-50»; el campo pide el importe sin signo y lo dice (el signo va aparte).
  it.each(['-150', '−150,50', '- 50', '$-150', '-$150', '+150'])('«%s» lleva signo: se pide sin él', (text) => {
    expect(parseMoneyInput(text, 'USD')).toEqual({
      ok: false,
      reason: 'invalid',
      message: moneyInputCopy.signed,
    });
  });

  it('vacío (o solo espacios) es «empty»', () => {
    expect(parseMoneyInput('', 'USD')).toEqual({ ok: false, reason: 'empty', message: moneyInputCopy.empty });
    expect(parseMoneyInput('   ', 'COP')).toMatchObject({ ok: false, reason: 'empty' });
  });

  // Revisión DX-241: la API y la base guardan TODO importe con 2 decimales
  // (`@IsMoney`, `Decimal(…, 2)`) y el catálogo de monedas no define otra
  // cosa. Un precio o un saldo en COP con céntimos que se precarga en un
  // campo tiene que poder guardarse sin tocarlo.
  it('todas las monedas admiten hasta 2 decimales, también COP y CLP', () => {
    expect(value('150,50', 'COP')).toBe(150.5);
    expect(value('150.000,50', 'COP')).toBe(150000.5);
    expect(value('1.500,5', 'CLP')).toBe(1500.5);
    expect(value('150,5', 'EUR')).toBe(150.5);
    expect(value('150.55', 'usd')).toBe(150.55);
    // Tres cifras tras el separador son miles en cualquier moneda.
    expect(value('150,555', 'COP')).toBe(150555);
  });

  it('un importe pegado tal como lo pinta la app (formatCurrency) se lee igual', () => {
    for (const currency of ['USD', 'EUR', 'COP', 'CLP', 'MXN']) {
      expect(value(formatCurrency(1500000.5, currency), currency)).toBe(1500000.5);
      expect(value(formatCurrency(150000, currency), currency)).toBe(150000);
    }
    expect(value('$ 150,50', 'USD')).toBe(150.5);
    expect(value('US$150.50', 'USD')).toBe(150.5);
    expect(value('COP 150.000', 'COP')).toBe(150000);
    expect(value('150.000 cop', 'COP')).toBe(150000);
    expect(value('150.000\u202FCOP', 'COP')).toBe(150000);
  });

  it('un código de otra moneda pegado no se da por bueno', () => {
    expect(parseMoneyInput('150,50 EUR', 'USD')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseMoneyInput('US$', 'USD')).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('sin parte entera, el separador con 1–2 cifras es el decimal: «.5» y «,50» son 0,5', () => {
    expect(value('.5', 'USD')).toBe(0.5);
    expect(value(',50', 'COP')).toBe(0.5);
  });

  it('los miles con el espacio duro de Intl (U+00A0, U+202F) valen como espacio', () => {
    expect(value('1\u00A0500\u00A0000,25', 'EUR')).toBe(1500000.25);
    expect(value('1\u202F500\u202F000', 'COP')).toBe(1500000);
  });

  it('por encima del tope de la API (10 enteros) es un error, no una cifra sin precisión', () => {
    expect(value('9.999.999.999,99', 'USD')).toBe(MONEY_INPUT_MAX);
    expect(parseMoneyInput('10.000.000.000', 'COP')).toEqual({
      ok: false,
      reason: 'tooLarge',
      message: moneyInputCopy.tooLarge,
    });
    expect(parseMoneyInput('99999999999999999999', 'USD')).toMatchObject({ ok: false, reason: 'tooLarge' });
  });

  it('una moneda desconocida (o sin elegir) admite 2 decimales', () => {
    expect(value('150,50', '')).toBe(150.5);
    expect(value('150,50', 'XYZ')).toBe(150.5);
  });

  it('no arrastra error de coma flotante', () => {
    expect(value('0,1', 'USD')).toBe(0.1);
    expect(value('1.000.000,07', 'USD')).toBe(1000000.07);
    expect(value('20,30', 'USD')).toBe(20.3);
  });
});

describe('parseDecimalInput (porcentajes con la misma regla)', () => {
  it('coma o punto decimal, con el máximo de decimales pedido', () => {
    expect(parseDecimalInput('12,5', 2)).toEqual({ ok: true, value: 12.5 });
    expect(parseDecimalInput('12.75', 2)).toEqual({ ok: true, value: 12.75 });
    // Tres cifras tras el separador son miles, también en un porcentaje: el
    // formulario lo rechaza luego por estar fuera de 0–100.
    expect(parseDecimalInput('12,755', 2)).toEqual({ ok: true, value: 12755 });
    expect(parseDecimalInput('1.2.5', 2)).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(parseDecimalInput('7,5', 0)).toEqual({
      ok: false,
      reason: 'decimals',
      message: moneyInputCopy.maxDecimals(0),
    });
  });
});

describe('moneyInputText', () => {
  it('rellena un campo con un texto que se vuelve a leer igual', () => {
    for (const [amount, currency] of [[1200000, 'COP'], [150000.5, 'COP'], [150.5, 'USD'], [0.07, 'EUR'], [1500, 'USD']] as const) {
      expect(parseMoneyInput(moneyInputText(amount), currency)).toEqual({ ok: true, value: amount });
    }
  });

  it('un total calculado con ruido de coma flotante se rellena redondeado a céntimos', () => {
    expect(moneyInputText(0.1 + 0.2)).toBe('0,3');
    expect(moneyInputText(100000.00000000001)).toBe('100000');
    expect(parseMoneyInput(moneyInputText(1234.5 * 3), 'COP')).toEqual({ ok: true, value: 3703.5 });
  });
});
