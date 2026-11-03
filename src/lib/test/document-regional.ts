import { documentFormat } from '@/lib/format/document-format';

/** La sede de los documentos de prueba (DX-354): Caracas, en español de Venezuela, reloj de 12 h. */
export const REGIONAL_VE = {
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
} as const;

/** Una sede de Nueva York: `en-US`, reloj de 12 h (ejemplo «A» de las pruebas de los impresos). */
export const REGIONAL_US = {
  timeZone: 'America/New_York',
  locale: 'en-US',
  hourCycle: 'h12',
} as const;

/** Una sede de Berlín: `de-DE`, reloj de 24 h (ejemplo «B» de las pruebas de los impresos). */
export const REGIONAL_DE = {
  timeZone: 'Europe/Berlin',
  locale: 'de-DE',
  hourCycle: 'h23',
} as const;

/** La misma sede vista por las páginas públicas de una cita (campos planos, en crudo). */
export const PUBLIC_REGIONAL_VE = {
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
} as const;

/**
 * Locale `es` en UTC con reloj de 24 h: las fechas `dd/mm/yyyy hh:mm` y los
 * importes `1.234,50 USD` con que se escribieron los textos de las pruebas de
 * los documentos. No es la sede de ningún usuario: es un formato conocido.
 */
export const REGIONAL_ES = { timeZone: 'UTC', locale: 'es', hourCycle: 'h23' } as const;

/** Los formatos de los ejemplos A (en-US, 12 h), B (de-DE, 24 h) y el de las pruebas existentes. */
export const FORMAT_ES = documentFormat(REGIONAL_ES)!;
export const FORMAT_US = documentFormat(REGIONAL_US)!;
export const FORMAT_DE = documentFormat(REGIONAL_DE)!;
