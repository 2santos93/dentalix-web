import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-295: el selector de estado de la cita no cambia la cita al moverse con
 * las flechas del teclado (en la QA de DX-279, ↓ dejó una cita en «Completada»).
 *
 * Una clínica nueva por corrida con un odontólogo, recepción, un paciente y una
 * cita agendada. Se cuentan los PATCH a `/appointments/:id` que salen del
 * navegador:
 * 1. 1440 px, fila de la agenda (Día → Lista): ↑/↓ y Esc → 0 PATCH, y tras
 *    recargar sigue «Agendada»; Enter sobre «Confirmada» → 1 PATCH y la fila
 *    lo refleja (también tras recargar);
 * 2. 390 px, detalle de la cita: ↑/↓ → 0 PATCH; Enter sobre «No asistió» →
 *    1 PATCH; el control mide al menos 44 px y no hay scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `estado-tecl-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.est.${suffix}@example.com` };
const dentist = { fullName: 'Luis Segundo', email: `luis.est.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.est.${suffix}@example.com` };
const patientLast = `Teclado${suffix}`.slice(0, 40);

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const day = sedeDayFromToday(n);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}

const DAY = weekdayFrom(2);
let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Estado ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Sara',
    lastName: patientLast,
    docType: 'CC',
    docNumber: `EST${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const luisId = members.find((m) => m.fullName === dentist.fullName)!.userId;
  await apiPost(request, session, '/appointments', {
    patientId: patient.id,
    providerId: luisId,
    start: atSede(DAY, '10:00').toISOString(),
    end: atSede(DAY, '10:30').toISOString(),
  });
});

/** Cuenta los PATCH a `/appointments/:id` que salen de la página. */
function countAppointmentPatches(page: Page): { readonly count: number } {
  const counter = { count: 0 };
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && /\/appointments\/[^/?]+(\?|$)/.test(req.url())) counter.count += 1;
  });
  return counter;
}

async function openDayList(page: Page) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(DAY);
}

/**
 * Recorre la lista abierta tecla a tecla, esperando a que el foco llegue a cada
 * opción antes de la siguiente (a ritmo de persona: con pulsaciones seguidas en
 * una máquina cargada Radix puede no haber movido aún el foco).
 */
async function walkOptions(page: Page, steps: Array<[string, string]>) {
  for (const [key, option] of steps) {
    await page.keyboard.press(key);
    await expect(page.getByRole('option', { name: option, exact: true })).toBeFocused();
  }
}

test('1440 px: en la fila, ↑/↓ no envían nada y Enter aplica el estado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  const patches = countAppointmentPatches(page);
  await openDayList(page);

  const row = page.locator('table tr', { hasText: `Sara ${patientLast}` });
  const status = row.getByRole('combobox', { name: /^Estado de la cita de 10:00–10:30/ });
  await expect(status).toHaveText('Agendada', { timeout: 15_000 });
  // El lector de pantalla oye el estado actual en el nombre del control.
  await expect(status).toHaveAccessibleName('Estado de la cita de 10:00–10:30: Agendada');

  await status.focus();
  await page.keyboard.press('ArrowDown');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(page.getByRole('option', { name: 'Agendada', exact: true })).toBeFocused();
  await walkOptions(page, [
    ['ArrowDown', 'Confirmada'],
    ['ArrowDown', 'Completada'],
    ['ArrowDown', 'Cancelada'],
    ['ArrowUp', 'Completada'],
    ['ArrowDown', 'Cancelada'],
  ]);
  await expect(page.getByRole('option', { name: 'Cancelada', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
  await expect(status).toBeFocused();
  // Una letra con el control cerrado tampoco cambia nada.
  await page.keyboard.press('c');
  await expect(status).toHaveText('Agendada');
  expect(patches.count).toBe(0);

  await page.reload();
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(DAY);
  await expect(status).toHaveText('Agendada', { timeout: 15_000 });
  expect(patches.count).toBe(0);

  // Enter sobre la opción enfocada sí aplica.
  await status.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Confirmada', exact: true })).toBeFocused();
  const patched = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && /\/appointments\//.test(res.url()),
  );
  await page.keyboard.press('Enter');
  expect((await patched).ok()).toBeTruthy();
  await expect(status).toHaveText('Confirmada', { timeout: 10_000 });
  expect(patches.count).toBe(1);
  // QA DX-295 (DEF-1): tras guardar, el foco sigue en el selector.
  await expect(status).toBeFocused();

  await page.reload();
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(DAY);
  await expect(status).toHaveText('Confirmada', { timeout: 15_000 });
});

test('390 px: en el detalle, ↑/↓ no envían nada y Enter aplica el estado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  const patches = countAppointmentPatches(page);
  await openDayList(page);

  await page
    .getByRole('button', { name: 'Detalle de la cita de 10:00–10:30' })
    .filter({ visible: true })
    .first()
    .click();
  const detail = page.getByRole('dialog', { name: `Sara ${patientLast}` });
  const status = detail.getByRole('combobox', { name: /^Estado: / });
  await expect(status).toHaveText('Confirmada', { timeout: 10_000 });
  await expect(status).toHaveAccessibleName('Estado: Confirmada');
  // Usable con el dedo: al menos 44 px de alto.
  expect((await status.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await status.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Confirmada', exact: true })).toBeFocused();
  await walkOptions(page, [
    ['ArrowDown', 'Completada'],
    ['ArrowDown', 'Cancelada'],
    ['ArrowUp', 'Completada'],
    ['ArrowDown', 'Cancelada'],
    ['ArrowDown', 'No asistió'],
  ]);
  await expect(page.getByRole('option', { name: 'No asistió', exact: true })).toBeFocused();
  await expectNoHorizontalScroll(page);
  expect(patches.count).toBe(0);

  const patched = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && /\/appointments\//.test(res.url()),
  );
  await page.keyboard.press('Enter');
  expect((await patched).ok()).toBeTruthy();
  await expect(status).toHaveText('No asistió', { timeout: 10_000 });
  expect(patches.count).toBe(1);
  await expect(status).toBeFocused();
});
