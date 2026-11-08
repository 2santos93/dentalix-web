import { test, expect, type Locator, type Page } from './support/test';
import { fillDate } from './support/dates';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-133-ter: la agenda del día con 8 profesionales y la tarjeta de una
 * cita de 30 min, en claro y oscuro, a 1440 y 390 px.
 *
 *   - 1440: las 8 columnas; la rejilla se desplaza por dentro (su región
 *     tiene scroll horizontal) y la página no.
 *   - 390: una columna con el selector; la página no se desplaza de lado.
 *   - La tarjeta de 30 min (48 px) enseña el nombre del paciente y el tipo
 *     de cita DENTRO de sus bordes: antes la fila del tipo quedaba recortada.
 *
 * Una clínica nueva por corrida: la dueña y 7 odontólogos, cada uno con una
 * cita de 30 min a las 09:00 de tipo «Limpieza dental».
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `agenda-ocho-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.ocho.${suffix}@example.com` };
const DENTISTS = ['Bruno', 'Carla', 'Diego', 'Elena', 'Fabio', 'Gabriela', 'Héctor'].map((first) => ({
  fullName: `${first} Odontólogo`,
  email: `${first.normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase()}.ocho.${suffix}@example.com`,
}));
const PROVIDERS = [admin, ...DENTISTS];
const TYPE_NAME = 'Limpieza dental';
// Apellido corto y real: la clínica es nueva en cada corrida, así que no hace
// falta el sufijo (alargaría el nombre y el «…» de un nombre largo es lo
// previsto en una columna de 10rem, no lo que se prueba aquí).
const PATIENT_LAST = 'Ruiz';
const day = sedeDayFromToday(2);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Ocho ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  for (const dentist of DENTISTS) {
    await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  }
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const type = await apiPost<{ id: string }>(request, session, '/appointment-types', {
    name: TYPE_NAME,
    durationMinutes: 30,
    color: '#0E7490',
  });
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  for (const [i, provider] of PROVIDERS.entries()) {
    const providerId = members.find((m) => m.fullName === provider.fullName)!.userId;
    const patient = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: provider.fullName.split(' ')[0],
      lastName: PATIENT_LAST,
      docType: 'NATIONAL_ID',
      docNumber: `OCH${i}${suffix}`.slice(0, 20),
      sex: 'F',
    });
    await apiPost(request, session, '/appointments', {
      patientId: patient.id,
      providerId,
      appointmentTypeId: type.id,
      start: atSede(day, '09:00').toISOString(),
      end: atSede(day, '09:30').toISOString(),
    });
  }
});

async function openDayColumns(page: Page) {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  // En el teléfono el Día abre en «Lista»; esta prueba es de las columnas.
  await page.getByRole('button', { name: 'Columnas', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  await expect(page.getByTestId('day-column')).toHaveCount(PROVIDERS.length, { timeout: 15_000 });
}

/**
 * El nombre y el tipo de la tarjeta se ven dentro de sus bordes (nunca
 * recortados por abajo). Con `typeMayTruncate` (8 columnas de 10rem y reloj
 * de 12 h: la hora ya llena la fila) el tipo puede acabar en «…»; sin él,
 * entero.
 */
async function expectCardReadable(card: Locator, patient: string, { typeMayTruncate = false } = {}) {
  await card.scrollIntoViewIfNeeded();
  const name = card.getByText(patient, { exact: true });
  const type = card.getByTestId('day-column-type');
  await expect(name).toBeVisible();
  await expect(type).toHaveText(TYPE_NAME);
  // Truncado o no, el tipo entero queda al pasar el ratón.
  await expect(type).toHaveAttribute('title', TYPE_NAME);
  const box = (await card.boundingBox())!;
  expect(box.height, 'la cita de 30 min mide 48 px').toBeLessThanOrEqual(50);
  for (const [what, el] of [
    ['nombre', name],
    ['tipo', type],
  ] as const) {
    const b = (await el.boundingBox())!;
    expect(b.y, `${what}: arriba dentro de la tarjeta`).toBeGreaterThanOrEqual(box.y - 0.5);
    expect(b.y + b.height, `${what}: abajo dentro de la tarjeta`).toBeLessThanOrEqual(box.y + box.height + 0.5);
    // Sin recortar: el texto cabe en su caja (ni elipsis en «Limpieza dental» ni en el nombre corto).
    if (what === 'tipo' && typeMayTruncate) continue;
    const clipped = await el.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    expect(clipped, `${what}: no se recorta a lo ancho`).toBe(false);
  }
}

for (const scheme of ['light', 'dark'] as const) {
  test(`1440 px (${scheme}): 8 columnas con scroll dentro de la rejilla, no de la página; la cita de 30 min se lee`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDayColumns(page);
    await expect(page.getByTestId('day-column').filter({ visible: true })).toHaveCount(PROVIDERS.length);
    const grid = page.getByRole('region', { name: 'Agenda del día por profesional' });
    const overflow = await grid.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, '8 columnas de 10rem no caben: la rejilla se desplaza por dentro').toBeGreaterThan(0);
    await expectNoHorizontalScroll(page);
    for (const provider of [PROVIDERS[0], PROVIDERS[PROVIDERS.length - 1]]) {
      const card = page
        .locator(`[data-testid="day-column"][aria-label="${provider.fullName}"]`)
        .getByTestId('day-column-appointment');
      await expectCardReadable(card, `${provider.fullName.split(' ')[0]} ${PATIENT_LAST}`, { typeMayTruncate: true });
    }
    await expectNoHorizontalScroll(page);
  });

  test(`390 px (${scheme}): una columna con selector, sin scroll lateral; la cita de 30 min se lee`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await openDayColumns(page);
    await expect(page.getByRole('group', { name: 'Profesional visible' })).toBeVisible();
    await expect(page.getByTestId('day-column').filter({ visible: true })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    const card = page.getByTestId('day-column').filter({ visible: true }).getByTestId('day-column-appointment');
    const first = await page.getByTestId('day-column').filter({ visible: true }).getAttribute('aria-label');
    await expectCardReadable(card, `${first!.split(' ')[0]} ${PATIENT_LAST}`);
  });
}
