import { expect, type Locator, type Page } from '@playwright/test';
import type { HourCycle } from '../../src/lib/format/regional-format';
import { countryName } from '../../src/lib/locations/countries';
import { SEDE_TODAY_TZ, SEDE_TZ } from './clock';

/**
 * Idioma del navegador de la suite (`locale` de playwright.config.ts): `es`,
 * sin región en `navigator.languages`, para que la web no sugiera ningún país
 * (DX-312 P1). El formato que sugiere sale de `Intl` y puede llevar la región
 * por defecto del motor (Chromium: `es-ES`); un spec que lo compruebe lo lee
 * de la página.
 */
export const E2E_BROWSER_LOCALE = 'es';

/**
 * Valores regionales de las sedes que crea la suite (G1, DX-313/314/317): la
 * API exige país, moneda, zona y formato al crear una sede o registrar una
 * clínica, sin ninguno por defecto. Coinciden con la zona y el idioma del
 * navegador de Playwright (`timezoneId` de playwright.config.ts) y con
 * `SEDE_TZ`, así que las horas que pinta la UI y las que calcula el spec son
 * las de la sede. Un spec que pruebe otra región pasa sus propios valores.
 *
 * G1-B (DX-350, I8): el reloj va explícito, `h23`, el que la suite mostraba
 * antes de que existiera el ajuste; así ninguna sede de la suite hereda el
 * reloj del navegador de Playwright.
 */
export interface RegionalSettings {
  /** Código ISO 3166-1 alfa-2 de la lista de países (DX-312). */
  country: string;
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

/**
 * DX-449: la región de las sedes con citas de HOY (ya empezadas o por
 * empezar): la de la suite con la zona `SEDE_TODAY_TZ`. El spec que la usa
 * abre el navegador en esa misma zona (`timezoneId`).
 */
export const E2E_TODAY_REGION: RegionalSettings = { ...E2E_REGION, timeZone: SEDE_TODAY_TZ };

/**
 * Elige el país en el selector «País» (DX-312, combobox con búsqueda): vacía
 * el campo, escribe el código y elige la opción con el nombre del país. Vaciar
 * primero no depende de que el navegador haya sugerido un país o no.
 */
export async function chooseCountry(scope: Page | Locator, code: string): Promise<void> {
  const name = countryName(code) ?? code;
  const field = scope.getByRole('combobox', { name: 'País', exact: true });
  await field.clear();
  await field.fill(code);
  await scope.getByRole('option', { name, exact: true }).click();
  await expect(field).toHaveValue(name);
}

/**
 * Elige una zona o un formato regional en su combobox (R1): escribe el id IANA
 * o la etiqueta BCP 47 (la búsqueda pone el valor exacto primero) y pulsa
 * Intro. El campo muestra después su nombre legible, no el código.
 */
export async function pickRegional(field: Locator, code: string): Promise<void> {
  await field.clear();
  await field.fill(code);
  await field.press('Enter');
}
