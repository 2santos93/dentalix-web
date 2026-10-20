/*
 * Lectura de lo que se escribe en un campo de importe (DX-241). Una sola regla
 * para toda la app, la misma tecleando con teclado en español o en inglés:
 *
 * - El ÚLTIMO separador (`.` o `,`) seguido de 1 o 2 cifras al final es el
 *   decimal: «150.50» y «150,50» son 150,5.
 * - Los miles se separan con `.`, `,` o espacio, siempre en grupos de 3 y con
 *   el mismo separador: «150.000», «1,500.25», «1 500 000,25».
 * - Lo que no encaja (grupos que no son de 3, separadores mezclados, un
 *   separador suelto) es ambiguo: se devuelve un error con el motivo y el
 *   formulario no envía nada. Mejor preguntar que guardar 100 veces más.
 * - Los decimales máximos salen de la moneda (`currencyDecimals`).
 *
 * La API sigue recibiendo un `number` y es la autoridad (importe > 0,
 * decimales por moneda): esto solo evita mandarle una cifra que no es la que
 * la persona quiso escribir.
 */

/**
 * Monedas que se manejan sin céntimos: las mismas que la API redondea a la
 * unidad (`discount-policy.ts`, COP sin decimales, EUR a céntimos).
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['COP', 'CLP', 'JPY', 'KRW', 'PYG']);

/** Decimales que admite un importe en `currency` (2 si no se conoce). */
export function currencyDecimals(currency: string): 0 | 2 {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

export const moneyInputCopy = {
  empty: 'Escribe un importe.',
  invalid: 'Escribe solo cifras, con punto o coma para los decimales.',
  ambiguous: (text: string) =>
    `No sabemos leer «${text}»: separa los miles en grupos de 3 (1.500.000) y los decimales con 1 o 2 cifras (150,50).`,
  noDecimals: (currency: string) => `${currency} no lleva decimales: escribe el importe sin céntimos.`,
  maxDecimals: (max: number) =>
    max === 0 ? 'Escribe un número sin decimales.' : `Admite hasta ${max} decimales.`,
  /** La vista previa bajo el campo: lo que se va a guardar, ya formateado. */
  preview: (formatted: string) => `Se guardará: ${formatted}`,
};

export type DecimalParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'invalid' | 'ambiguous' | 'decimals'; message: string };

const SEPARATORS = /[., ]/;
const DIGITS = /^\d+$/;

/** La parte entera, con o sin miles: `null` si los grupos no son de 3. */
function integerDigits(text: string, decimalSeparator: string | null): string | null {
  if (DIGITS.test(text)) return text;
  const separator = text.match(SEPARATORS)?.[0];
  if (!separator || separator === decimalSeparator) return null;
  const groups = text.split(separator);
  const [first, ...rest] = groups;
  if (!/^[1-9]\d{0,2}$/.test(first)) return null;
  if (!rest.every((group) => /^\d{3}$/.test(group))) return null;
  return groups.join('');
}

/**
 * Un número decimal escrito a mano (importe, porcentaje), con hasta
 * `maxDecimals` decimales. Sin signo: los formularios que restan lo piden
 * aparte.
 */
export function parseDecimalInput(raw: string, maxDecimals: number): DecimalParseResult {
  // Los espacios duros que trae un importe copiado de la propia app
  // («150.000,00 COP» lleva U+00A0) cuentan como espacio.
  const text = raw.replace(/[  ]/g, ' ').trim();
  if (text === '') return { ok: false, reason: 'empty', message: moneyInputCopy.empty };
  if (!/^[\d., ]+$/.test(text)) return { ok: false, reason: 'invalid', message: moneyInputCopy.invalid };
  const ambiguous = { ok: false as const, reason: 'ambiguous' as const, message: moneyInputCopy.ambiguous(text) };

  const decimal = text.match(/([.,])(\d{1,2})$/);
  const integerText = decimal ? text.slice(0, -decimal[0].length) : text;
  const fraction = decimal ? decimal[2] : '';
  const integer = integerDigits(integerText, decimal ? decimal[1] : null);
  if (integer === null) return ambiguous;
  if (fraction.length > maxDecimals) {
    return { ok: false, reason: 'decimals', message: moneyInputCopy.maxDecimals(maxDecimals) };
  }
  // De texto canónico a número: «1500000.25» se lee exacto, sin pasar por
  // multiplicaciones que arrastren error de coma flotante.
  return { ok: true, value: Number(fraction ? `${integer}.${fraction}` : integer) };
}

/**
 * Importe escrito en un campo de dinero, con los decimales de su moneda.
 * Ver la regla en la cabecera del fichero.
 */
export function parseMoneyInput(text: string, currency: string): DecimalParseResult {
  const max = currencyDecimals(currency);
  const result = parseDecimalInput(text, max);
  if (!result.ok && result.reason === 'decimals' && max === 0) {
    return { ...result, message: moneyInputCopy.noDecimals(currency.toUpperCase()) };
  }
  return result;
}

/**
 * El texto con el que se rellena un campo de importe a partir de un número
 * (p. ej. el total que se propone): sin miles y con coma decimal, así
 * `parseMoneyInput` lo vuelve a leer igual.
 */
export function moneyInputText(amount: number): string {
  return String(amount).replace('.', ',');
}
