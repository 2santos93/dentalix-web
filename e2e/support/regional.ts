import type { HourCycle } from '../../src/lib/format/regional-format';
import { SEDE_TZ } from './clock';

/**
 * Valores regionales de las sedes que crea la suite (G1, DX-313/314/317): la
 * API exige país, moneda, zona y formato al crear una sede o registrar una
 * clínica, sin ninguno por defecto. Coinciden con la zona y el idioma del
 * navegador de Playwright (`timezoneId`/`locale` de playwright.config.ts) y con
 * `SEDE_TZ`, así que las horas que pinta la UI y las que calcula el spec son
 * las de la sede. Un spec que pruebe otra región pasa sus propios valores.
 *
 * G1-B (DX-350, I8): el reloj va explícito, `h23`, el que la suite mostraba
 * antes de que existiera el ajuste; así ninguna sede de la suite hereda el
 * reloj del navegador de Playwright.
 */
export interface RegionalSettings {
  country: 'CO' | 'ES';
  currency: string;
  timeZone: string;
  locale: string;
  hourCycle: HourCycle;
}

export const E2E_REGION: RegionalSettings = {
  country: 'CO',
  currency: 'COP',
  timeZone: SEDE_TZ,
  locale: 'es-CO',
  hourCycle: 'h23',
};
