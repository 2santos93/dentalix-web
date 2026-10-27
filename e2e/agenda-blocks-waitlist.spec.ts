import { test, expect, type Locator, type Page } from './support/test';
import { confirmCancellation } from './support/cancellation';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { API_URL, tenantOrigin } from './support/urls';
import { chooseAppointmentStatus } from './support/appointment-status';

/**
 * e2e DX-122: bloqueos de agenda y «Pendientes por agendar».
 *
 * Una clínica nueva por corrida con un odontólogo («Luis Segundo») y
 * recepción («Rita Recepción»), horario lun–vie 9–13 y 15–19 (Bogotá) y dos
 * pacientes. Los tests van en serie:
 * 1. recepción bloquea las vacaciones de Luis → la agenda las pinta y una
 *    cita encima se rechaza con el 409 en español;
 * 2. cancelar una cita la deja en «Pendientes» → «Buscar hueco» no ofrece el
 *    día de vacaciones → «Agendar aquí» crea la cita y la saca de la lista;
 * 3. 390 px: el panel es un cajón a pantalla completa (el foco vuelve al
 *    cerrar) y el formulario de bloqueo cabe sin scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `bloqueos-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.blq.${suffix}@example.com` };
const dentist = { fullName: 'Luis Segundo', email: `luis.blq.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.blq.${suffix}@example.com` };
const camilaDoc = `BLQ${suffix}`.slice(0, 20);
const brunoLast = `Pendiente${suffix}`.slice(0, 40);

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const day = sedeDayFromToday(n);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}
function daysFromToday(day: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${sedeDayFromToday(0)}T12:00:00Z`)) / 86_400_000);
}

const VACATION_DAY = weekdayFrom(3);
const BOOK_DAY = weekdayFrom(daysFromToday(VACATION_DAY) + 1);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Bloqueos ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: {
      ranges: [1, 2, 3, 4, 5].flatMap((weekday) => [
        { weekday, startMinute: 540, endMinute: 780 },
        { weekday, startMinute: 900, endMinute: 1140 },
      ]),
    },
  });
  expect(schedule.ok()).toBeTruthy();
  await apiPost(request, session, '/patients', {
    firstName: 'Camila',
    lastName: `Bloqueo${suffix}`.slice(0, 40),
    docType: 'CC',
    docNumber: camilaDoc,
    sex: 'F',
  });
  const bruno = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Bruno',
    lastName: brunoLast,
    docType: 'CC',
    docNumber: `BLQB${suffix}`.slice(0, 20),
    sex: 'M',
  });
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const luisId = members.find((m) => m.fullName === dentist.fullName)!.userId;
  // La cita que recepción cancelará en el test 2.
  await apiPost(request, session, '/appointments', {
    patientId: bruno.id,
    providerId: luisId,
    start: atSede(BOOK_DAY, '10:00').toISOString(),
    end: atSede(BOOK_DAY, '10:30').toISOString(),
  });
});

function column(page: Page, name: string): Locator {
  return page.locator(`[data-testid="day-column"][aria-label="${name}"]`);
}

async function openDay(page: Page, day: string) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(day);
  await expect(page.getByTestId('day-column').first()).toBeVisible({ timeout: 15_000 });
}

test('recepción bloquea las vacaciones de Luis: se ven en la agenda y una cita encima se rechaza (409)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);

  await page.getByRole('button', { name: 'Bloquear horario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bloquear horario' });
  await dialog.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await expect(dialog.getByLabel('Motivo', { exact: true })).toHaveValue('VACATION');
  await dialog.getByLabel('Desde', { exact: true }).fill(VACATION_DAY);
  await dialog.getByLabel('Hasta (incluido)').fill(VACATION_DAY);
  await dialog.getByLabel('Nota (opcional)').fill('Vacaciones de Luis');
  await dialog.getByRole('button', { name: 'Bloquear', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText('Horario bloqueado.')).toBeVisible();

  await openDay(page, VACATION_DAY);
  const luis = column(page, dentist.fullName);
  await expect(luis.getByRole('note', { name: /^Bloqueo: Vacaciones: Vacaciones de Luis/ })).toBeVisible();
  await expect(page.getByText('Horario bloqueado (vacaciones, reunión, almuerzo…)')).toBeVisible();
  // Solo en su columna: la de Ana sigue libre.
  await expect(column(page, admin.fullName).getByTestId('schedule-block')).toHaveCount(0);

  await luis.getByRole('button', { name: `Nueva cita con ${dentist.fullName}` }).click();
  const form = page.getByRole('form', { name: 'Agendar cita' });
  await form.getByLabel('Paciente', { exact: true }).fill(camilaDoc);
  await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
  await form.getByLabel('Hora de inicio', { exact: true }).fill('10:00');
  await form.getByLabel('Hora de fin').fill('10:30');
  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(
    // Un día completo se nombra por el día elegido, no por el fin exclusivo.
    form.getByText(
      `La agenda del profesional está bloqueada (Vacaciones) el ${VACATION_DAY.slice(8, 10)}/${VACATION_DAY.slice(5, 7)}. Elige otro horario.`,
      { exact: true },
    ),
  ).toBeVisible({ timeout: 10_000 });
});

test('cancelar una cita la deja en «Pendientes» y reactivarla la saca; «Buscar hueco» respeta el bloqueo y «Agendar aquí» la saca de la lista', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await openDay(page, BOOK_DAY);

  // Panel lateral fijo en 1440 px, vacío al principio.
  const panel = page.getByRole('complementary', { name: 'Pendientes por agendar' });
  await expect(panel.getByText('No hay pacientes pendientes por agendar')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  const status = page.getByTestId('appointment-status-select').filter({ visible: true }).first();
  await chooseAppointmentStatus(status, 'Cancelada');
  await confirmCancellation(page, 'El paciente avisa', 'ILLNESS');
  const entry = panel.getByTestId('waitlist-entry').filter({ hasText: `Bruno ${brunoLast}` });
  await expect(entry).toBeVisible({ timeout: 10_000 });
  await expect(entry).toContainText('Canceló la cita del');

  // Si la cita vuelve a estar activa, el paciente sale solo de la lista (H1);
  // si se cancela otra vez, vuelve.
  await chooseAppointmentStatus(status, 'Agendada');
  await expect(panel.getByText('No hay pacientes pendientes por agendar')).toBeVisible({ timeout: 10_000 });
  await chooseAppointmentStatus(status, 'Cancelada');
  await confirmCancellation(page, 'El paciente avisa', 'ILLNESS');
  await expect(entry).toBeVisible({ timeout: 10_000 });

  await entry.getByRole('button', { name: `Buscar hueco para Bruno ${brunoLast}` }).click();
  const search = page.getByRole('dialog', { name: `Buscar hueco para Bruno ${brunoLast}` });
  await expect(search.getByLabel('Profesional', { exact: true })).toHaveValue(/.+/);
  await expect(search.getByLabel('Profesional', { exact: true }).locator('option:checked')).toHaveText(dentist.fullName);

  // El día de vacaciones de Luis no tiene huecos.
  await search.getByLabel('Desde', { exact: true }).fill(VACATION_DAY);
  await search.getByLabel('Hasta', { exact: true }).fill(VACATION_DAY);
  await search.getByRole('button', { name: 'Buscar' }).click();
  await expect(search.getByText('No hay huecos libres en estas fechas')).toBeVisible({ timeout: 10_000 });

  // El día de la cita: solo dentro del horario (9–13 y 15–19).
  await search.getByLabel('Hasta', { exact: true }).fill(BOOK_DAY);
  await search.getByLabel('Desde', { exact: true }).fill(BOOK_DAY);
  await search.getByRole('button', { name: 'Buscar' }).click();
  const openings = search.getByTestId('opening');
  await expect(openings).toHaveCount(2, { timeout: 10_000 });
  await expect(openings.nth(0)).toContainText('09:00–13:00');
  await expect(openings.nth(1)).toContainText('15:00–19:00');

  await openings.nth(0).getByRole('button', { name: /^Agendar aquí el / }).click();
  await expect(search).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(/^Cita agendada: Bruno/)).toBeVisible();
  await expect(panel.getByText('No hay pacientes pendientes por agendar')).toBeVisible();
  // La agenda del día ya la muestra (09:00–09:30, la duración de la original).
  await expect(page.getByRole('table', { name: /agenda/i }).filter({ visible: true })).toContainText(
    '09:00–09:30',
    { timeout: 10_000 },
  );
});

test('móvil (390 px): «Pendientes» es un cajón a pantalla completa y el formulario de bloqueo cabe sin scroll horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);

  const opener = page.getByRole('button', { name: /^Pendientes/ });
  await opener.click();
  const drawer = page.getByRole('dialog', { name: 'Pendientes por agendar' });
  await expect(drawer.getByText('No hay pacientes pendientes por agendar')).toBeVisible({ timeout: 10_000 });
  // Tras la animación de entrada: ocupa toda la pantalla.
  await expect
    .poll(async () => {
      const box = (await drawer.boundingBox())!;
      return [box.x, box.y, box.width, box.height].map(Math.round);
    })
    .toEqual([0, 0, 390, 844]);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();

  await page.getByRole('button', { name: 'Bloquear horario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bloquear horario' });
  await expect(dialog.getByLabel('Motivo', { exact: true })).toBeVisible();
  await dialog.getByLabel('Motivo', { exact: true }).selectOption('LUNCH');
  await expect(dialog.getByLabel('Hora de inicio', { exact: true })).toBeVisible();
  // Tras la animación de entrada: el modal entero dentro de los 390 px.
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return box.x >= 0 && box.x + box.width <= 390;
    })
    .toBe(true);
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dialog: (() => {
      const el = document.querySelector('[role="dialog"]');
      return el ? el.scrollWidth - el.clientWidth : 0;
    })(),
  }));
  expect(overflow.page).toBeLessThanOrEqual(0);
  expect(overflow.dialog).toBeLessThanOrEqual(0);
});
