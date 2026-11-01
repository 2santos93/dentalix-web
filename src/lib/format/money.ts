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
 * - Hasta 2 decimales en TODAS las monedas, también COP y CLP: la API y la
 *   base guardan cualquier importe con céntimos (`@IsMoney`, `Decimal(…, 2)`)
 *   y un campo no se redondea al escribirlo. Así un precio o un saldo en COP
 *   con céntimos que se precarga en un campo se guarda sin tocarlo. (El
 *   redondeo a la unidad de COP es solo de las líneas que se calculan, como
 *   el descuento en bloque, con los `roundingDigits` que manda la API:
 *   `lib/money/line-rounding.ts`, DX-340.)
 * - Un importe pegado tal como lo pinta la app («1.500.000,50 USD»,
 *   «150,50 EUR») o con un símbolo («150,50 €») se lee igual: se quita el símbolo o el
 *   código de la moneda del campo, nunca el de otra.
 * - Hasta el tope de la API (`MONEY_INPUT_MAX`, 10 enteros).
 *
 * La API sigue recibiendo un `number` y es la autoridad (importe > 0, como
 * mucho 2 decimales): esto solo evita mandarle una cifra que no es la que
 * la persona quiso escribir.
 */

/** Decimales que admite un importe escrito, en cualquier moneda. */
const MONEY_DECIMALS = 2;

/** Tope de la API para un importe (`MONEY_MAX` de `bounded-decimal.ts`). */
export const MONEY_INPUT_MAX = 9_999_999_999.99;

export const moneyInputCopy = {
  empty: 'Escribe un importe.',
  /** Para los campos que exigen un importe positivo (abono, compromiso…). */
  positive: 'Escribe un importe mayor que 0.',
  invalid: 'Escribe solo cifras, con punto o coma para los decimales.',
  ambiguous: (text: string) =>
    `No sabemos leer «${text}»: separa los miles en grupos de 3 (1.500.000) y los decimales con 1 o 2 cifras (150,50).`,
  tooLarge: 'El importe es demasiado grande: como mucho 9.999.999.999,99.',
  signed: 'Escribe el importe sin signo: solo cifras, con punto o coma para los decimales.',
  maxDecimals: (max: number) =>
    max === 0 ? 'Escribe un número sin decimales.' : `Admite hasta ${max} decimales.`,
  /** La vista previa bajo el campo: lo que se va a guardar, ya formateado. */
  preview: (formatted: string) => `Se guardará: ${formatted}`,
};

export type DecimalParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'invalid' | 'ambiguous' | 'decimals' | 'tooLarge'; message: string };

const SEPARATORS = /[., ]/;
/** Un signo delante («-50», «− 50», «+50»): el importe se escribe sin él. */
const LEADING_SIGN = /^[-\u2212+]\s*/;
const DIGITS = /^\d+$/;

/** La parte entera, con o sin miles: `null` si los grupos no son de 3. */
function integerDigits(text: string, decimalSeparator: string | null): string | null {
  if (DIGITS.test(text)) return text;
  // «.5» / «,50»: sin parte entera, el separador solo puede ser el decimal.
  if (text === '' && decimalSeparator) return '0';
  const separator = text.match(SEPARATORS)?.[0];
  if (!separator || separator === decimalSeparator) return null;
  const groups = text.split(separator);
  const [first, ...rest] = groups;
  if (!/^[1-9]\d{0,2}$/.test(first)) return null;
  if (!rest.every((group) => /^\d{3}$/.test(group))) return null;
  return groups.join('');
}

/** Los espacios duros de Intl (U+00A0, U+202F) cuentan como espacio. */
function normalizeSpaces(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ').trim();
}

/**
 * Quita el símbolo o el código de la moneda del campo, delante o detrás, como
 * los pinta `formatCurrency` («150,50 USD», «150,50 EUR», DX-378) o como se
 * escriben a mano («$ 150,50», «150,50 €»). El código de otra moneda se queda y el
 * texto no se entiende: mejor eso que guardar euros como dólares.
 */
function stripCurrency(raw: string, currency: string): string {
  const text = normalizeSpaces(raw);
  const affixes = currencyAffixes(currency);
  const lower = text.toLowerCase();
  for (const affix of affixes) {
    if (lower.startsWith(affix)) {
      const rest = text.slice(affix.length).trim();
      if (/\d/.test(rest)) return rest;
    }
    if (lower.endsWith(affix)) {
      const rest = text.slice(0, -affix.length).trim();
      if (/\d/.test(rest)) return rest;
    }
  }
  return text;
}

const affixCache = new Map<string, string[]>();

/** Cómo se puede escribir la moneda junto al importe: «$», «usd», «us$», «€»… */
function currencyAffixes(currency: string): string[] {
  const cached = affixCache.get(currency);
  if (cached) return cached;
  const affixes = new Set(['$']);
  if (/^[a-z]{3}$/i.test(currency)) {
    affixes.add(currency.toLowerCase());
    for (const currencyDisplay of ['symbol', 'narrowSymbol'] as const) {
      try {
        const symbol = new Intl.NumberFormat('es', { style: 'currency', currency, currencyDisplay })
          .formatToParts(0)
          .find((part) => part.type === 'currency')?.value;
        if (symbol) affixes.add(symbol.toLowerCase());
      } catch {
        // Código que Intl no conoce: basta con el propio código.
      }
    }
  }
  // Primero los más largos: «us$» antes que «$».
  const sorted = [...affixes].sort((x, y) => y.length - x.length);
  affixCache.set(currency, sorted);
  return sorted;
}

/**
 * Un número decimal escrito a mano (importe, porcentaje), con hasta
 * `maxDecimals` decimales. Sin signo: los formularios que restan lo piden
 * aparte.
 */
export function parseDecimalInput(raw: string, maxDecimals: number): DecimalParseResult {
  // Los espacios duros que trae un importe copiado de la propia app
  // («150.000,00 COP» lleva U+00A0) cuentan como espacio.
  const text = normalizeSpaces(raw);
  if (text === '') return { ok: false, reason: 'empty', message: moneyInputCopy.empty };
  if (LEADING_SIGN.test(text) && parseDecimalInput(text.replace(LEADING_SIGN, ''), maxDecimals).ok) {
    return { ok: false, reason: 'invalid', message: moneyInputCopy.signed };
  }
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
  // «-$150»: el signo va antes que el símbolo («$-150» lo ve parseDecimalInput).
  const normalized = normalizeSpaces(text);
  if (LEADING_SIGN.test(normalized) && parseMoneyInput(normalized.replace(LEADING_SIGN, ''), currency).ok) {
    return { ok: false, reason: 'invalid', message: moneyInputCopy.signed };
  }
  const result = parseDecimalInput(stripCurrency(text, currency), MONEY_DECIMALS);
  if (result.ok && result.value > MONEY_INPUT_MAX) {
    return { ok: false, reason: 'tooLarge', message: moneyInputCopy.tooLarge };
  }
  return result;
}

/**
 * El texto con el que se rellena un campo de importe a partir de un número
 * (p. ej. el total que se propone): sin miles y con coma decimal, así
 * `parseMoneyInput` lo vuelve a leer igual.
 */
export function moneyInputText(amount: number): string {
  // Redondeado a céntimos: un total sumado en el cliente puede traer ruido de
  // coma flotante (0,1 + 0,2 = 0,30000000000000004) que no se volvería a leer.
  return String(Math.round(amount * 100) / 100).replace('.', ',');
}
