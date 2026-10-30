import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Escribir fechas y horas en los campos segmentados (`DateField`,
 * `DatePicker`, `DateRangePicker`, `TimeField` de `src/components/ui`), que
 * sustituyen a `<input type="date|time">`. No tienen `.fill()`: cada segmento
 * (día, mes, año, hora, minuto, a. m./p. m.) es un `spinbutton` que acepta
 * cifras tecleadas. Los helpers escriben segmento a segmento según su
 * `data-type`, así que valen para cualquier orden del locale de la sede
 * (dd/mm/aaaa, mm/dd/yyyy, aaaa-mm-dd).
 *
 * Migrar un spec:
 *   await page.getByLabel('Fecha').fill('2026-10-30')
 *   → await fillDate(page, 'Fecha', '2026-10-30')
 *   await dialog.getByLabel('Hora').fill('09:30')
 *   → await fillTime(dialog, 'Hora', '09:30')
 *   desde.fill(a); hasta.fill(b) (un periodo en un solo campo)
 *   → await fillDateRange(page, 'Periodo', a, b)
 *
 * `label` es el nombre del campo: su `FormField` o su `label`. `scope` puede
 * ser la página o un contenedor (un diálogo) para desambiguar.
 */

type Scope = Page | Locator;

function fieldGroup(scope: Scope, label: string | RegExp): Locator {
  return scope.getByRole('group', { name: label, exact: typeof label === 'string' ? true : undefined });
}

/** Escribe cada valor en su segmento (`data-type`) dentro de `container`. */
async function typeSegments(container: Locator, values: Partial<Record<string, string>>): Promise<void> {
  const segments = container.locator('[role="spinbutton"][data-type]');
  await expect(segments.first()).toBeVisible();
  const count = await segments.count();
  for (let i = 0; i < count; i += 1) {
    const segment = segments.nth(i);
    const type = await segment.getAttribute('data-type');
    const value = type ? values[type] : undefined;
    if (value === undefined) continue;
    await segment.click();
    await segment.pressSequentially(value);
  }
}

function dateParts(iso: string): Record<string, string> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`fillDate: «${iso}» no es un día ISO YYYY-MM-DD`);
  return { year: match[1], month: match[2], day: match[3] };
}

/** Un día `YYYY-MM-DD` en un `DateField` o `DatePicker`. */
export async function fillDate(scope: Scope, label: string | RegExp, iso: string): Promise<void> {
  await typeSegments(fieldGroup(scope, label), dateParts(iso));
}

/** Un periodo en un `DateRangePicker` (ambos días incluidos, `YYYY-MM-DD`). */
export async function fillDateRange(scope: Scope, label: string | RegExp, from: string, to: string): Promise<void> {
  const group = fieldGroup(scope, label);
  await typeSegments(group.locator('[data-range-part="start"]'), dateParts(from));
  await typeSegments(group.locator('[data-range-part="end"]'), dateParts(to));
}

/**
 * Una hora `HH:mm` (24 h) en un `TimeField`. Si la sede usa reloj de 12 h el
 * campo tiene segmento a. m./p. m.: se escribe la hora de 12 y «a»/«p».
 */
export async function fillTime(scope: Scope, label: string | RegExp, hhmm: string): Promise<void> {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`fillTime: «${hhmm}» no es una hora HH:mm`);
  const group = fieldGroup(scope, label);
  const hour = Number(match[1]);
  const twelveHour = (await group.locator('[role="spinbutton"][data-type="dayPeriod"]').count()) > 0;
  await typeSegments(group, {
    hour: twelveHour ? String(hour % 12 === 0 ? 12 : hour % 12).padStart(2, '0') : match[1],
    minute: match[2],
    dayPeriod: twelveHour ? (hour < 12 ? 'a' : 'p') : undefined,
  });
}

/** El día ISO que muestra un `DateField`/`DatePicker` (para `expect`). */
export async function readDate(scope: Scope, label: string | RegExp): Promise<string> {
  const group = fieldGroup(scope, label);
  const read = async (type: string) =>
    (await group.locator(`[role="spinbutton"][data-type="${type}"]`).first().getAttribute('aria-valuenow')) ?? '';
  const [year, month, day] = await Promise.all([read('year'), read('month'), read('day')]);
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
