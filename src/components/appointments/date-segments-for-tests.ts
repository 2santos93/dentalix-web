import { screen, within } from '@testing-library/react';

/*
 * Ayudas de jest para los campos segmentados de UX v2 (`DatePicker`,
 * `DateField`, `TimeField`): cada parte es un `spinbutton` con `data-type`,
 * sin `.value` que leer ni `type()` de un tirón. Se escribe segmento a
 * segmento, así que vale para cualquier orden del locale (dd/mm/aaaa en `es`).
 * Solo para pruebas; las de e2e usan `e2e/support/dates.ts`.
 */

/** `userEvent.setup()` o el `userEvent` por defecto: solo hace falta clic y teclado. */
type User = { click: (element: Element) => Promise<unknown>; keyboard: (text: string) => Promise<unknown> };
type Root = HTMLElement | undefined;

function group(name: string | RegExp, root?: Root): HTMLElement {
  return root ? within(root).getByRole('group', { name }) : screen.getByRole('group', { name });
}

function segment(field: HTMLElement, type: string): HTMLElement | null {
  return field.querySelector<HTMLElement>(`[role="spinbutton"][data-type="${type}"]`);
}

async function typeInto(user: User, field: HTMLElement, values: Record<string, string>) {
  for (const [type, value] of Object.entries(values)) {
    const el = segment(field, type);
    if (!el) continue;
    await user.click(el);
    await user.keyboard(value);
  }
}

/** Escribe un día `YYYY-MM-DD` en el campo de fecha llamado `name`. */
export async function typeDate(user: User, name: string | RegExp, iso: string, root?: Root) {
  const [year, month, day] = iso.split('-');
  await typeInto(user, group(name, root), { day, month, year });
}

/** Escribe una hora `HH:mm` (24 h) en el campo de hora llamado `name`. */
export async function typeTime(user: User, name: string | RegExp, hhmm: string, root?: Root) {
  const [hour, minute] = hhmm.split(':');
  const field = group(name, root);
  // Sede con reloj de 12 h: hora de 12 y a. m./p. m. (como `fillTime` en e2e).
  if (segment(field, 'dayPeriod')) {
    const h = Number(hour);
    await typeInto(user, field, {
      hour: String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0'),
      minute,
      dayPeriod: h < 12 ? 'a' : 'p',
    });
    return;
  }
  await typeInto(user, field, { hour, minute });
}

/** Borra todos los segmentos del campo `name` (Retroceso en cada uno). */
export async function clearSegments(user: User, name: string | RegExp, root?: Root) {
  const field = group(name, root);
  for (const el of Array.from(field.querySelectorAll<HTMLElement>('[role="spinbutton"]'))) {
    await user.click(el);
    await user.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}');
  }
}

function read(field: HTMLElement, type: string, width: number): string | null {
  const el = segment(field, type);
  if (!el || el.hasAttribute('data-placeholder')) return null;
  const now = el.getAttribute('aria-valuenow');
  return now ? now.padStart(width, '0') : null;
}

/** El día ISO del campo `name`, o `''` si está vacío. */
export function readDate(name: string | RegExp, root?: Root): string {
  const field = group(name, root);
  const [y, m, d] = [read(field, 'year', 4), read(field, 'month', 2), read(field, 'day', 2)];
  return y && m && d ? `${y}-${m}-${d}` : '';
}

/** La hora `HH:mm` del campo `name`, o `''` si está vacío. */
export function readTime(name: string | RegExp, root?: Root): string {
  const field = group(name, root);
  const [h, m] = [read(field, 'hour', 2), read(field, 'minute', 2)];
  if (!h || !m) return '';
  const period = segment(field, 'dayPeriod');
  if (!period) return `${h}:${m}`;
  // 12 h: aria-valuenow del segmento de hora ya es la hora de 0 a 23.
  return `${h}:${m}`;
}

/** El grupo de segmentos del campo `name` (para `toHaveAttribute`, foco…). */
export function dateGroup(name: string | RegExp, root?: Root): HTMLElement {
  return group(name, root);
}
