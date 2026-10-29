import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-026: Ajustes → Recordatorios. El ADMIN activa los recordatorios por
 * email de su sede principal con 48 h y 2 h (y la validación habla en
 * español); recepción no ve la entrada en Ajustes, la pantalla le dice que es de
 * administración y la API le responde 403 en español; el detalle de una cita
 * enseña sus recordatorios pendientes; todo cabe en 390 px.
 *
 * Una clínica nueva por corrida (sufijo único): la dueña (ADMIN) y una
 * recepcionista, sede sin restricción de horario. Los tests van en serie: el
 * primero deja la sede principal activa.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `recordatorios-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.rec.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.rec.${suffix}@example.com` };
const patientLastName = `Recordada${suffix}`.slice(0, 40);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Recordatorios ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
});

test('ADMIN entra por Ajustes, activa la sede principal con 48 h y 2 h y la validación es en español', async ({
  page,
}) => {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients`);
  await page.getByRole('button', { name: new RegExp(admin.fullName, 'i') }).first().click();
  // DX-282: el menú de cuenta lleva a «Ajustes», que agrupa los ajustes por tema.
  await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(`${origin}/settings`);
  await page.getByRole('link', { name: 'Recordatorios' }).click();
  await expect(page).toHaveURL(`${origin}/settings/recordatorios`);
  await expect(page.getByRole('heading', { name: 'Recordatorios' })).toBeVisible();

  const table = page.getByRole('table', { name: 'Recordatorios por sede' });
  const row = table.getByRole('row', { name: /Sede principal/ });
  await expect(row).toContainText('Desactivados', { timeout: 15_000 });

  await row.getByRole('button', { name: 'Configurar los recordatorios de Sede principal' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Recordatorios de Sede principal' })).toBeVisible();

  // Validación en español antes de llegar a la API.
  await dialog.getByLabel('Enviar recordatorios por email').check();
  const first = dialog.getByLabel('Recordatorio 1: horas antes');
  await first.fill('200');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Cada recordatorio debe ser de 1 a 168 horas antes (7 días).',
  );

  await first.fill('48');
  await expect(dialog.getByLabel('Recordatorio 2: horas antes')).toHaveValue('2');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('Activos');
  await expect(row).toContainText('2 días y 2 h antes');

  // Persistido en la API.
  await page.reload();
  await expect(
    page.getByRole('table', { name: 'Recordatorios por sede' }).getByRole('row', { name: /Sede principal/ }),
  ).toContainText('2 días y 2 h antes', { timeout: 15_000 });
});

test('recepción: no ve la entrada en Ajustes, la pantalla es de administración y la API responde 403 en español', async ({
  page,
  request,
}) => {
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients`);
  await page.getByRole('button', { name: new RegExp(reception.fullName, 'i') }).first().click();
  await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  await expect(page.getByRole('link', { name: 'Horarios' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Recordatorios' })).toHaveCount(0);

  await page.goto(`${origin}/settings/recordatorios`);
  await expect(page.getByText('Solo administración configura los recordatorios.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('table', { name: 'Recordatorios por sede' })).toHaveCount(0);

  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': new URL(origin).host },
    data: { email: reception.email, password },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const res = await request.get(`${API_URL}/reminder-settings`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': new URL(origin).host },
  });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { message: string }).message).toBe(
    'Solo un administrador puede ver y cambiar los recordatorios.',
  );
});

test('el detalle de una cita enseña sus recordatorios pendientes', async ({ page, request }) => {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Carolina',
    lastName: patientLastName,
    docType: 'NATIONAL_ID',
    docNumber: `REC${suffix}`.slice(0, 20),
    sex: 'F',
    email: `carolina.${suffix}@example.com`,
  });
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const providerId = members.find((m) => m.fullName === admin.fullName)!.userId;
  const day = sedeDayFromToday(3);
  await apiPost(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: atSede(day, '10:00').toISOString(),
    end: atSede(day, '10:30').toISOString(),
  });

  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(day);
  const row = page.locator('table tr', { hasText: `Carolina ${patientLastName}` });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: /Detalle de la cita de 10:00–10:30/ }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Recordatorios por email' })).toBeVisible();
  const list = sheet.getByRole('list', { name: 'Recordatorios de la cita' });
  await expect(list.getByRole('listitem')).toHaveCount(2, { timeout: 10_000 });
  await expect(list.getByRole('listitem').nth(0)).toContainText('Pendiente');
  await expect(list.getByRole('listitem').nth(0)).toContainText('2 días antes');
  await expect(list.getByRole('listitem').nth(1)).toContainText('2 h antes');
});

test('móvil (390 px): tarjetas por sede y el modal cabe sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/recordatorios`);

  const cards = page.getByRole('list', { name: 'Recordatorios por sede' });
  await expect(cards.getByRole('listitem').first()).toContainText('Sede principal', { timeout: 15_000 });
  await expect(page.getByRole('table', { name: 'Recordatorios por sede' })).toBeHidden();
  await expectNoHorizontalScroll(page);

  await cards.getByRole('button', { name: 'Configurar los recordatorios de Sede principal' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Enviar recordatorios por email')).toBeChecked();
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});
