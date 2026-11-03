/** La sede de los documentos de prueba (DX-354): Caracas, en español de Venezuela, reloj de 12 h. */
export const REGIONAL_VE = {
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
} as const;

/** La misma sede vista por las páginas públicas de una cita (campos planos, en crudo). */
export const PUBLIC_REGIONAL_VE = {
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
} as const;
