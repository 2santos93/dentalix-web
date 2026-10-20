import { currencyDecimals, moneyInputCopy, moneyInputText, parseDecimalInput, parseMoneyInput } from './money';

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
    ',50',
    '1 50',
    '1 500.000',
  ])('«%s» es ambiguo', (text) => {
    expect(parseMoneyInput(text, 'USD')).toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it.each(['abc', '-150', '$150', '1e5', '15O'])('«%s» no es un importe', (text) => {
    expect(parseMoneyInput(text, 'USD')).toEqual({
      ok: false,
      reason: 'invalid',
      message: moneyInputCopy.invalid,
    });
  });

  it('vacío (o solo espacios) es «empty»', () => {
    expect(parseMoneyInput('', 'USD')).toEqual({ ok: false, reason: 'empty', message: moneyInputCopy.empty });
    expect(parseMoneyInput('   ', 'COP')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('los decimales máximos salen de la moneda: COP y CLP sin decimales, USD y EUR con 2', () => {
    expect(parseMoneyInput('150,50', 'COP')).toEqual({
      ok: false,
      reason: 'decimals',
      message: moneyInputCopy.noDecimals('COP'),
    });
    expect(parseMoneyInput('1.500,5', 'CLP')).toMatchObject({ ok: false, reason: 'decimals' });
    expect(value('150,5', 'EUR')).toBe(150.5);
    expect(value('150.55', 'usd')).toBe(150.55);
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

describe('currencyDecimals', () => {
  it('0 para las monedas sin céntimos de uso, 2 para el resto', () => {
    expect(currencyDecimals('COP')).toBe(0);
    expect(currencyDecimals('clp')).toBe(0);
    expect(currencyDecimals('USD')).toBe(2);
    expect(currencyDecimals('EUR')).toBe(2);
    expect(currencyDecimals('')).toBe(2);
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
    for (const [amount, currency] of [[1200000, 'COP'], [150.5, 'USD'], [0.07, 'EUR'], [1500, 'USD']] as const) {
      expect(parseMoneyInput(moneyInputText(amount), currency)).toEqual({ ok: true, value: amount });
    }
  });
});
