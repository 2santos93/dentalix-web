import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeDayFromToday } from './support/clock';
import { API_URL, tenantOrigin } from './support/urls';
import { fillTime } from './support/dates';

/**
 * e2e DX-446: huecos reservados para urgencias.
 *
 * Una clínica nueva por corrida con un odontólogo («Luis Urgencias») y
 * recepción («Rita Reserva»), horario lun–vie 9–19 (Bogotá), dos tipos de
 * cita («Consulta de urgencia», de urgencia, y «Limpieza») y dos pacientes.
 * En serie:
 * 1. recepción reserva 15:00–16:00 de Luis para urgencias (liberación 11:00)
 *    y la agenda lo pinta;
 * 2. recepción agenda una «Limpieza» a las 15:00 → 409 en español, sin
 *    «Agendar igualmente»; con «Consulta de urgencia», se agenda;
 * 3. Luis agenda una «Limpieza» a las 15:30 → 409 con «Agendar igualmente»,
 *    que exige motivo y entonces agenda;
 * 4. 390 px: el formulario del hueco reservado cabe sin scroll horizontal.
 *
 * El día del hueco es un laborable a 3 días o más: la liberación (11:00 de
 * ese día) aún no ha llegado, corra cuando corra.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `reservas-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.rsv.${suffix}@example.com` };
const dentist = { fullName: 'Luis Urgencias', email: `luis.rsv.${suffix}@example.com` };
const reception = { fullName: 'Rita Reserva', email: `rita.rsv.${suffix}@example.com` };
const camilaDoc = `RSV${suffix}`.slice(0, 20);
const brunoDoc = `RSVB${suffix}`.slice(0, 20);
const RESERVED_MESSAGE =
  'Ese horario está reservado para urgencias (Consulta de urgencia). Elige otro hueco o usa un tipo permitido.';

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const day = sedeDayFromToday(n);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}
const DAY = weekdayFrom(3);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Reservas ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: {
      ranges: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1140 })),
    },
  });
  expect(schedule.ok()).toBeTruthy();
  await apiPost(request, session, '/appointment-types', {
    name: 'Consulta de urgencia',
    durationMinutes: 30,
    color: '#DC2626',
    isUrgent: true,
  });
  await apiPost(request, session, '/appointment-types', {
    name: 'Limpieza',
    durationMinutes: 30,
    color: '#16A34A',
  });
  for (const [firstName, docNumber] of [
    ['Camila', camilaDoc],
    ['Bruno', brunoDoc],
  ]) {
    await apiPost(request, session, '/patients', {
      firstName,
      lastName: `Reserva${suffix}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber,
      sex: 'F',
    });
  }
});

function column(page: Page, name: string): Locator {
  return page.locator(`[data-testid="day-column"][aria-label="${name}"]`);
}

async function openDay(page: Page) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(DAY);
  await expect(page.getByTestId('day-column').first()).toBeVisible({ timeout: 15_000 });
}

async function startBooking(page: Page, doc: string, start: string, type: string): Promise<Locator> {
  // El botón «Nueva cita con …» de la columna solo sale mientras la columna
  // está vacía (tras la cita del test anterior ya no): se usa el de cabecera
  // y se elige el profesional en el formulario (abre con el día de la agenda).
  await page.getByRole('button', { name: 'Nueva cita', exact: true }).click();
  const form = page.getByRole('form', { name: 'Agendar cita' });
  await form.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await expect(form.getByLabel('Fecha', { exact: true })).toHaveValue(DAY);
  await form.getByLabel('Paciente', { exact: true }).fill(doc);
  await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
  await form.getByLabel('Tipo de cita (opcional)').selectOption({ label: `${type} · 30 min` });
  await form.getByLabel('Hora de inicio', { exact: true }).fill(start);
  return form;
}

test('recepción reserva 15:00–16:00 de Luis para urgencias y la agenda lo pinta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);

  await page.getByRole('button', { name: 'Bloquear horario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bloquear horario' });
  await dialog.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await dialog.getByLabel('Motivo', { exact: true }).selectOption('RESERVED');
  await expect(dialog.getByRole('checkbox', { name: /Consulta de urgencia/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /Limpieza/ })).not.toBeChecked();
  await dialog.getByLabel('Desde', { exact: true }).fill(DAY);
  await dialog.getByLabel('Hasta (incluido)').fill(DAY);
  await dialog.getByLabel('Hora de inicio', { exact: true }).fill('15:00');
  await dialog.getByLabel('Hora de fin', { exact: true }).fill('16:00');
  await fillTime(dialog, 'Liberar a partir de (opcional)', '11:00');
  await dialog.getByRole('button', { name: 'Bloquear', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  await openDay(page);
  await expect(
    column(page, dentist.fullName).getByRole('note', { name: /^Bloqueo: Urgencias · reservado/ }),
  ).toBeVisible();
});

test('recepción: «Limpieza» en el hueco reservado da 409 legible; «Consulta de urgencia» se agenda', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await openDay(page);

  const form = await startBooking(page, camilaDoc, '15:00', 'Limpieza');
  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(form.getByText(RESERVED_MESSAGE, { exact: true })).toBeVisible({ timeout: 10_000 });
  // Recepción no puede saltarse la reserva.
  await expect(form.getByRole('button', { name: 'Agendar igualmente' })).toHaveCount(0);

  await form.getByLabel('Tipo de cita (opcional)').selectOption({ label: 'Consulta de urgencia · 30 min' });
  await form.getByLabel('Hora de inicio', { exact: true }).fill('15:00');
  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(form).toBeHidden({ timeout: 10_000 });
});

test('Luis agenda una «Limpieza» en el hueco reservado con «Agendar igualmente» y motivo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
  await openDay(page);

  const form = await startBooking(page, brunoDoc, '15:30', 'Limpieza');
  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(form.getByText(RESERVED_MESSAGE, { exact: true })).toBeVisible({ timeout: 10_000 });
  const force = form.getByRole('button', { name: 'Agendar igualmente' });
  await force.click();
  await expect(form.getByText('Escribe un motivo de entre 5 y 300 caracteres.')).toBeVisible();
  await form.getByLabel('Motivo para agendar igualmente').fill('Paciente que solo puede a esta hora');
  await force.click();
  await expect(form).toBeHidden({ timeout: 10_000 });
});

test('390 px: el formulario del hueco reservado cabe sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Bloquear horario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bloquear horario' });
  await dialog.getByLabel('Motivo', { exact: true }).selectOption('RESERVED');
  await expect(dialog.getByRole('checkbox', { name: /Consulta de urgencia/ })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
