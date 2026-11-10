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
 * el 409 con el nombre y las horas sin mover nada. DX-479: arrastrar entre
 * sillones mantiene el profesional (se ofrece el del sillón, «Mantener» por
 * defecto), un sillón ocupado da el 409 y la cita vuelve, y «Sin sillón» la
 * deja sin sillón.
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
  await card.getByRole('button', { name: /^09:00–09:30.*Detalle de la cita/ }).click();
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

test('DX-479: arrastrar entre sillones mantiene el profesional salvo «Asignar»; ocupado → 409 y vuelve; «Sin sillón» la deja sin sillón', async ({
  page,
  request,
}) => {
  // «Sillón 2» pasa a tener a Ana por defecto: al soltar ahí la cita de Luis se pregunta.
  const chairs = await request.get(`${API_URL}/chairs?locationId=${locationId}`, { headers: session.headers });
  const two = ((await chairs.json()) as { id: string; name: string }[]).find((c) => c.name === 'Sillón 2')!;
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const adminId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === admin.fullName,
  )!.userId;
  const patched = await request.patch(`${API_URL}/chairs/${two.id}`, {
    headers: session.headers,
    data: { defaultProviderId: adminId },
  });
  expect(patched.ok()).toBeTruthy();

  await loginInSede(page);
  await openChairDay(page);
  const card = chairColumn(page, 'Sillón 1').getByTestId('day-column-appointment');
  await card.scrollIntoViewIfNeeded();
  const from = (await card.boundingBox())!;
  const twoColumn = (await chairColumn(page, 'Sillón 2').boundingBox())!;

  // Agarra la tarjeta cerca de su borde superior y suéltala en «Sillón 2», 30
  // min más abajo (1,6 px por minuto).
  const grabY = from.y + 6;
  await page.mouse.move(from.x + from.width / 2, grabY);
  await page.mouse.down();
  await page.mouse.move(twoColumn.x + twoColumn.width / 2, grabY + 20, { steps: 5 });
  await page.mouse.move(twoColumn.x + twoColumn.width / 2, grabY + 48, { steps: 5 });
  await expect(page.getByTestId('drag-preview')).toContainText('Mover a las 09:30 · Sillón 2');
  await page.mouse.up();

  // Se pregunta ANTES de mover, con «Mantener» enfocado: Enter conserva a Luis.
  const offer = page.getByRole('dialog', { name: `¿Asignar a ${admin.fullName}?` });
  await expect(offer).toBeVisible();
  await expect(offer.getByRole('button', { name: `Mantener a ${dentist.fullName}` })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(offer).toBeHidden();

  const moved = chairColumn(page, 'Sillón 2').getByTestId('day-column-appointment').filter({ hasText: '09:30–10:00' });
  await expect(moved).toBeVisible({ timeout: 10_000 });
  await expect(moved).not.toHaveAttribute('aria-busy', 'true', { timeout: 10_000 });
  await expect(page.getByText('Cita movida a «Sillón 2», 09:30–10:00.')).toBeVisible();
  // El profesional sigue siendo Luis (va en el nombre accesible de la tarjeta).
  await expect(
    moved.getByRole('button', { name: new RegExp(`^09:30–10:00.*Detalle de la cita · ${dentist.fullName}`) }),
  ).toBeVisible();

  // Sobre la cita de Bruno de las 11:00 en «Sillón 2»: 409 con el nombre y
  // las horas, y la tarjeta vuelve a las 09:30.
  const again = (await moved.boundingBox())!;
  const top = again.y + 6;
  await page.mouse.move(again.x + again.width / 2, top);
  await page.mouse.down();
  await page.mouse.move(again.x + again.width / 2, top + 20, { steps: 5 });
  // 09:30 -> 11:00 son 90 min: 144 px más abajo.
  await page.mouse.move(again.x + again.width / 2, top + 144, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('El sillón «Sillón 2» ya está ocupado de 11:00 a 11:30')).toBeVisible({
    timeout: 10_000,
  });
  await expect(moved).toContainText('09:30–10:00');
  await expect(moved).not.toHaveAttribute('aria-busy', 'true', { timeout: 10_000 });

  // A «Sin sillón» a la misma hora: solo cambia el sillón, sin preguntar.
  const none = (await chairColumn(page, 'Sin sillón').boundingBox())!;
  const box = (await moved.boundingBox())!;
  const y = box.y + 6;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(none.x + none.width / 2, y + 12, { steps: 5 });
  await page.mouse.move(none.x + none.width / 2, y, { steps: 5 });
  await expect(page.getByTestId('drag-preview')).toContainText('Mover a las 09:30 · Sin sillón');
  await page.mouse.up();
  const unseated = chairColumn(page, 'Sin sillón').getByTestId('day-column-appointment');
  await expect(unseated).toContainText('09:30–10:00', { timeout: 10_000 });
  await expect(page.getByText('Cita movida a Sin sillón.')).toBeVisible();
  await expect(chairColumn(page, 'Sillón 2').getByTestId('day-column-appointment')).toHaveCount(1);
});

/**
 * DX-480: clic en un hueco libre de la columna de un sillón (no el botón de
 * columna vacía): el formulario trae ese sillón y su profesional por defecto,
 * y los dos se pueden cambiar sin que el sillón pise al profesional elegido.
 */
async function expectSlotPrefill(page: Page, chairName: string, providerName: string) {
  // Arriba del todo de la columna no hay citas (la de Bruno es a las 11:00).
  await chairColumn(page, chairName).click({ position: { x: 20, y: 8 } });
  const form = page.getByRole('form', { name: 'Agendar cita' });
  const chair = form.getByLabel('Sillón (opcional)');
  const provider = form.getByLabel('Profesional', { exact: true });
  await expect(chair.locator('option:checked')).toHaveText(chairName);
  await expect(provider.locator('option:checked')).toHaveText(providerName, { timeout: 10_000 });
  return { form, chair, provider };
}

test('DX-480: el clic en un hueco de «Sillón 2» precarga el sillón y su profesional por defecto, editables', async ({
  page,
  request,
}) => {
  const chairs = await request.get(`${API_URL}/chairs?locationId=${locationId}`, { headers: session.headers });
  const two = ((await chairs.json()) as { id: string; name: string }[]).find((c) => c.name === 'Sillón 2')!;
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const adminId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === admin.fullName,
  )!.userId;
  const patched = await request.patch(`${API_URL}/chairs/${two.id}`, {
    headers: session.headers,
    data: { defaultProviderId: adminId },
  });
  expect(patched.ok()).toBeTruthy();

  await loginInSede(page);
  await openChairDay(page);
  const { form, chair, provider } = await expectSlotPrefill(page, 'Sillón 2', admin.fullName);

  // Los dos se cambian a mano; cambiar el sillón no cambia al profesional.
  await provider.selectOption({ label: dentist.fullName });
  await chair.selectOption({ label: 'Sillón 1' });
  await expect(chair.locator('option:checked')).toHaveText('Sillón 1');
  await expect(provider.locator('option:checked')).toHaveText(dentist.fullName);
  await chair.selectOption({ label: 'Sillón 2' });
  await expect(provider.locator('option:checked')).toHaveText(dentist.fullName);
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();

  // 390 px: una columna con selector; el hueco de «Sillón 2» precarga lo mismo.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('group', { name: 'Sillón visible' }).getByRole('button', { name: 'Sillón 2' }).click();
  await expect(chairColumn(page, 'Sillón 2')).toBeVisible();
  await expectSlotPrefill(page, 'Sillón 2', admin.fullName);
  await expectNoHorizontalScroll(page);
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
