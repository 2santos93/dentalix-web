import { test, expect, type Locator, type Page } from './support/test';
import { fillDate, fillTime } from './support/dates';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-211 (porción 1): sillones por sede. ADMIN crea «Sillón 1» (con el
 * odontólogo por defecto) y «Sillón 2» en Ajustes → Sillones; agenda una cita
 * desde la columna de «Sillón 1» en la vista Día «Sillones» (el profesional
 * lo propone el sillón); y mover la cita a «Sillón 2», ocupado a esa hora, da
 * el 409 con el nombre y las horas sin mover nada. El arrastre entre
 * columnas de sillón queda para la porción siguiente.
 *
 * Una clínica nueva por corrida, sede sin restricción de horario. En serie:
 * cada test sigue donde lo dejó el anterior.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `sillones-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.${suffix}@example.com` };
const dentist = { fullName: 'Luis Sillón', email: `luis.${suffix}@example.com` };
const patientDoc = `SIL${suffix}`.slice(0, 20);
const otherDoc = `SILB${suffix}`.slice(0, 20);
const day = sedeDayFromToday(2);

let session: ApiSession;
let locationId = '';
let otherPatientId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Sillones ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  locationId = ((await locations.json()) as { id: string }[])[0].id;
  await apiPost(request, session, '/patients', {
    firstName: 'Camila',
    lastName: `Sillones${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: patientDoc,
    sex: 'F',
  });
  const other = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Bruno',
    lastName: `Ocupado${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: otherDoc,
    sex: 'M',
  });
  otherPatientId = other.id;
});

/** La vista por sillón es de una sede concreta: se elige la de la clínica. */
async function loginInSede(page: Page) {
  await loginAs(page, origin, admin.email, password);
  await page.evaluate((id) => window.localStorage.setItem('dentalix.activeLocationId', id), locationId);
}

function chairColumn(page: Page, name: string): Locator {
  return page.locator(`[data-testid="day-column"][aria-label="${name}"]`);
}

async function openChairDay(page: Page) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Columnas', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  await page.getByRole('button', { name: 'Sillones', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Agenda del día por sillón' })).toBeVisible({ timeout: 15_000 });
}

test('ADMIN crea «Sillón 1» (con profesional por defecto) y «Sillón 2»; un nombre repetido da 409', async ({ page }) => {
  await loginInSede(page);
  await page.goto(`${origin}/settings`);
  await page.getByRole('link', { name: /Sillones/ }).click();
  await expect(page.getByText('Esta sede no tiene sillones')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Crear sillón' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill('Sillón 1');
  await dialog.getByLabel('Profesional por defecto (opcional)').selectOption({ label: dentist.fullName });
  await dialog.getByRole('button', { name: 'Crear sillón' }).click();
  await expect(dialog).toBeHidden();

  for (const name of ['Sillón 2', 'sillón 2']) {
    await page.getByRole('button', { name: 'Nuevo sillón' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByRole('button', { name: 'Crear sillón' }).click();
  }
  await expect(dialog.getByText('Ya existe un sillón con ese nombre en esta sede.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();

  const list = page.getByRole('table', { name: 'Sillones de la sede' });
  await expect(list).toContainText('Sillón 1');
  await expect(list).toContainText(dentist.fullName);
  await expect(list).toContainText('Sillón 2');
});

test('vista Día «Sillones»: una columna por sillón y «Sin sillón»; la cita de «Sillón 1» toma su profesional por defecto', async ({
  page,
}) => {
  await loginInSede(page);
  await openChairDay(page);
  await expect(page.getByTestId('day-column-header')).toHaveText([/Sillón 1/, /Sillón 2/, /Sin sillón/]);

  await chairColumn(page, 'Sillón 1').getByRole('button', { name: 'Nueva cita en Sillón 1' }).click();
  const form = page.getByRole('form', { name: 'Agendar cita' });
  await expect(form.getByLabel('Sillón (opcional)')).toHaveValue(/.+/);
  await expect(form.getByLabel('Profesional', { exact: true })).not.toHaveValue('');
  await expect(form.getByLabel('Profesional', { exact: true }).locator('option:checked')).toHaveText(dentist.fullName);
  await form.getByLabel('Paciente', { exact: true }).fill(patientDoc);
  await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
  await fillTime(form, 'Hora de inicio', '09:00');
  await fillTime(form, 'Hora de fin', '09:30');
  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(form).toBeHidden({ timeout: 10_000 });

  const card = chairColumn(page, 'Sillón 1').getByTestId('day-column-appointment');
  await expect(card).toContainText('09:00–09:30');
  await card.getByRole('button', { name: /^Detalle de la cita/ }).click();
  await expect(page.getByTestId('appointment-chair')).toHaveText('Sillón 1');
  await page.keyboard.press('Escape');
  await expectNoHorizontalScroll(page);
});

test('mover la cita a «Sillón 2» ocupado da el 409 con su nombre y horas, y la cita no cambia', async ({
  page,
  request,
}) => {
  const chairs = await request.get(`${API_URL}/chairs?locationId=${locationId}`, { headers: session.headers });
  const two = ((await chairs.json()) as { id: string; name: string }[]).find((c) => c.name === 'Sillón 2')!;
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const adminId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === admin.fullName,
  )!.userId;
  // «Sillón 2» ocupado de 11:00 a 11:30 por otra profesional.
  await apiPost(request, session, '/appointments', {
    patientId: otherPatientId,
    providerId: adminId,
    chairId: two.id,
    start: atSede(day, '11:00').toISOString(),
    end: atSede(day, '11:30').toISOString(),
  });

  await loginInSede(page);
  await openChairDay(page);
  const card = chairColumn(page, 'Sillón 1').getByTestId('day-column-appointment');
  await card.getByRole('button', { name: /^Mover a… la cita de/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sillón').selectOption({ label: 'Sillón 2' });
  await fillTime(dialog, 'Hora de inicio', '11:00');
  await dialog.getByRole('button', { name: 'Mover cita' }).click();
  await expect(dialog.getByText('El sillón «Sillón 2» ya está ocupado de 11:00 a 11:30')).toBeVisible({
    timeout: 10_000,
  });
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(chairColumn(page, 'Sillón 1').getByTestId('day-column-appointment')).toContainText('09:00–09:30');
});

test('móvil (390 px): Ajustes → Sillones y la vista por sillón (una columna con selector) sin scroll horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInSede(page);
  await page.goto(`${origin}/settings/sillones`);
  await expect(page.getByRole('list', { name: 'Sillones de la sede' })).toContainText('Sillón 1', { timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await openChairDay(page);
  await expect(page.getByRole('group', { name: 'Sillón visible' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
