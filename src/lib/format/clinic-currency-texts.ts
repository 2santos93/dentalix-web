import { NO_CURRENCY_TEXTS, readCurrencyTexts, type CurrencyTexts } from '@/lib/format/currency-text';

/**
 * DX-517: el texto propio de cada moneda de la clínica de esta pestaña, que
 * usan `formatCurrency` y `moneyWithCode` cuando quien llama no pasa otro
 * (los ~170 sitios que pintan importes no tienen que enhebrarlo).
 *
 * Llega con la marca de la clínica, que el layout raíz pide en el servidor, y
 * lo fija `CurrencyTextsSync` en el NAVEGADOR antes de pintar ningún hijo. En
 * el servidor nunca se fija: el estado de un módulo lo comparten las
 * peticiones de todas las clínicas (y ninguna pantalla pinta importes en el
 * servidor: todas leen sus datos en el cliente con la sesión). Sin
 * configurar: vacío, y todo se pinta como siempre (código ISO, DX-378).
 *
 * Copia en `sessionStorage` (por host): cuando el servidor no supo la clínica
 * (un dominio propio, `*.localhost`), la pestaña pinta con la última conocida
 * mientras la vuelve a pedir (`CurrencyTextsSync`).
 */
let current: CurrencyTexts = NO_CURRENCY_TEXTS;

const CACHE_KEY = 'dentalix.currencyTexts';

export function clinicCurrencyTexts(): CurrencyTexts {
  return current;
}

/** Fija el mapa de la clínica (solo en el navegador). Lo que no es válido se ignora. */
export function setClinicCurrencyTexts(texts: unknown): void {
  if (typeof window === 'undefined') return;
  current = readCurrencyTexts(texts);
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(current));
  } catch {
    // Sin almacenamiento (modo privado estricto): solo se pierde la copia.
  }
}

/** La última copia de esta pestaña, o vacía. Nunca lanza. */
export function cachedClinicCurrencyTexts(): CurrencyTexts {
  if (typeof window === 'undefined') return NO_CURRENCY_TEXTS;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    return raw ? readCurrencyTexts(JSON.parse(raw)) : NO_CURRENCY_TEXTS;
  } catch {
    return NO_CURRENCY_TEXTS;
  }
}

/** Mismo mapa (mismas monedas y textos), sin importar el orden. */
export function sameCurrencyTexts(a: CurrencyTexts, b: CurrencyTexts): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}
