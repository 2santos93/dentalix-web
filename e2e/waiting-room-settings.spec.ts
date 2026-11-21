import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes, axeViolations } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-588 contra la API real: Ajustes › Pantallas de sala de espera (ADMIN)
 * a 1440 y 390 px en claro y oscuro con axe limpio; crear la pantalla deja ver
 * el enlace entero UNA vez, con QR; el televisor abre ese enlace y muestra al
 * paciente que llega («Ana R.») en menos de 15 s y, al pasar al sillón, en
 * «Pasando a consulta» con su sillón; en modo turno no sale ningún nombre; y
 * revocar deja el televisor en «Esta pantalla ya no está activa».
 *
 * Una clínica nueva por corrida. En serie: cada test sigue donde lo dejó el anterior.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `salaespera-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.${suffix}@example.com` };
const dentist = { fullName: 'Luis Pérez', email: `luis.${suffix}@example.com` };
const SCREEN_NAME = 'Televisor de recepción';

let session: ApiSession;
let locationId = '';
let dentistId = '';
let chairId = '';
let patientId = '';
let screenUrl = '';

test.describe.configure({ mode: 'serial' });

async function api<T>(
  request: APIRequestContext,
  method: 'get' | 'patch' | 'post',
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await request[method](`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `${method.toUpperCase()} ${path}: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Ávila ${suffix}`.slice(0, 60),
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
  // «Atender sin cita» (walk-in) exige un tipo de cita de urgencia activo, y una
  // clínica recién registrada no tiene ninguno (409), como en chairs-in-clinic.
  await api(request, 'post', '/appointment-types', {
    name: 'Consulta de urgencia',
    durationMinutes: 30,
    color: '#DC2626',
    isUrgent: true,
  });
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  locationId = ((await locations.json()) as { id: string }[])[0].id;
  const staff = await api<{ userId: string; fullName: string }[]>(request, 'get', '/staff');
  dentistId = staff.find((m) => m.fullName === dentist.fullName)?.userId ?? '';
  expect(dentistId, 'id del odontólogo').not.toBe('');
  chairId = (await apiPost<{ id: string }>(request, session, '/chairs', { locationId, name: 'Sillón 2' })).id;
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Ana',
      lastName: `Rodríguez${suffix}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber: `SALA${suffix}`.slice(0, 20),
      sex: 'F',
    })
  ).id;
});

async function openSettings(page: Page) {
  await page.goto(`${origin}/settings/pantallas-de-sala`);
  await expect(page.getByRole('heading', { level: 1, name: 'Pantallas de sala de espera' })).toBeVisible();
}

test('ADMIN: Ajustes a 1440 y 390 px, claro y oscuro, axe limpio; crear muestra el enlace una vez con QR', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await openSettings(page);
  const main = page.getByRole('main');
  await expect(main.getByText('Esta sede no tiene pantallas')).toBeVisible();
  await expect(main.getByText(/Fully Kiosk Browser/)).toBeVisible();
  const empty = await axeInBothThemes(page, main);
  expect(empty.light, 'axe en claro (vacío)').toEqual([]);
  expect(empty.dark, 'axe en oscuro (vacío)').toEqual([]);
  await shot(page, 'ajustes-vacio', 1440);

  await main.getByRole('button', { name: 'Nueva pantalla' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre', { exact: true }).fill(SCREEN_NAME);
  await dialog.getByRole('button', { name: 'Añadir mensaje' }).click();
  await dialog.getByLabel('Mensaje 1', { exact: true }).fill('Horario: lunes a viernes de 8:00 a 17:00');
  const form = await axeInBothThemes(page, dialog);
  expect(form.light, 'axe del formulario en claro').toEqual([]);
  expect(form.dark, 'axe del formulario en oscuro').toEqual([]);
  await dialog.getByRole('button', { name: 'Crear pantalla' }).click();

  const url = dialog.getByTestId('waiting-room-screen-url');
  await expect(url).toHaveValue(new RegExp(`^${origin.replace(/[.]/g, '\\.')}/sala/[^/]+$`));
  screenUrl = await url.inputValue();
  await expect(dialog.getByText('Copia el enlace ahora: no se podrá volver a ver')).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Código QR con el enlace de la pantalla' })).toBeVisible();
  const created = await axeInBothThemes(page, dialog);
  expect(created.light, 'axe del enlace en claro').toEqual([]);
  expect(created.dark, 'axe del enlace en oscuro').toEqual([]);
  await shot(page, 'ajustes-creada', 1440);
  await dialog.getByRole('button', { name: 'Listo' }).click();
  await expect(dialog).toBeHidden();

  // El enlace no se vuelve a ver: ni en la lista ni al recargar.
  await expect(main.getByRole('table', { name: 'Pantallas de la sede' })).toContainText(SCREEN_NAME);
  const token = screenUrl.split('/sala/')[1];
  await page.reload();
  await expect(main.getByRole('table', { name: 'Pantallas de la sede' })).toContainText(SCREEN_NAME);
  expect(await page.content()).not.toContain(token);

  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);
  await expect(main.getByText(SCREEN_NAME)).toBeVisible();
  await expectNoHorizontalScroll(page);
  const phone = await axeInBothThemes(page, main);
  expect(phone.light, 'axe a 390 en claro').toEqual([]);
  expect(phone.dark, 'axe a 390 en oscuro').toEqual([]);
  await shot(page, 'ajustes-lista', 390);
});

test('el televisor: quien llega sale en menos de 15 s, al sillón pasa a consulta; en modo turno sin nombres', async ({
  browser,
  request,
}) => {
  expect(screenUrl, 'el test anterior crea la pantalla').not.toBe('');
  const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'light' });
  const page = await tv.newPage();
  try {
    await page.goto(screenUrl);
    await expect(page.getByText('Nadie en espera')).toBeVisible();
    await expect(page.getByTestId('waiting-room-message')).toHaveText('Horario: lunes a viernes de 8:00 a 17:00');

    const walkIn = await api<{ id: string }>(request, 'post', '/appointments/walk-in', {
      patientId,
      providerId: dentistId,
      chairId,
      overbookReason: 'Llegó sin cita (e2e de la sala de espera)',
    });
    const waiting = page.getByTestId('waiting-room-waiting-item');
    await expect(waiting).toHaveText([/^Ana R\./], { timeout: 15_000 });
    // Nunca el apellido entero.
    await expect(page.getByTestId('waiting-room-board')).not.toContainText(`Rodríguez${suffix}`);

    await api(request, 'patch', `/appointments/${walkIn.id}`, { status: 'IN_CHAIR' });
    const called = page.getByTestId('waiting-room-called-item');
    await expect(called).toHaveCount(1, { timeout: 15_000 });
    await expect(called).toContainText('Ana R.');
    await expect(called).toContainText('Sillón 2');
    await expect(waiting).toHaveCount(0);
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight)).toBe(true);
    expect(await axeViolations(page, page.locator('body'))).toEqual([]);

    // Modo turno: ningún nombre en la pantalla.
    const screens = await api<{ id: string; name: string }[]>(
      request,
      'get',
      `/waiting-room-screens?locationId=${locationId}`,
    );
    const screenId = screens.find((s) => s.name === SCREEN_NAME)!.id;
    await api(request, 'patch', `/waiting-room-screens/${screenId}`, { nameMode: 'TURN_NUMBER' });
    await expect(called).toContainText(/Turno \d+/, { timeout: 15_000 });
    await expect(page.getByTestId('waiting-room-board')).not.toContainText('Ana');
  } finally {
    await tv.close();
  }
});

test('«Turno N» en En clínica; revocar con confirmación deja el televisor en «Esta pantalla ya no está activa»', async ({
  page,
  browser,
}) => {
  const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tvPage = await tv.newPage();
  try {
    await tvPage.goto(screenUrl);
    await expect(tvPage.getByTestId('waiting-room-board')).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, admin.email, password);
    // «En clínica» enseña al personal el turno que sale en el televisor.
    await page.goto(`${origin}/agenda/en-clinica`);
    const row = page.getByTestId('in-clinic-item').filter({ hasText: `Rodríguez${suffix}` });
    await expect(row.getByTestId('in-clinic-turn')).toHaveText(/^Turno \d+$/, { timeout: 15_000 });

    await openSettings(page);
    await page.getByRole('button', { name: `Acciones de ${SCREEN_NAME}` }).click();
    await page.getByRole('menuitem', { name: 'Revocar' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(confirm).toContainText('Esta pantalla ya no está activa');
    await confirm.getByRole('button', { name: 'Revocar pantalla' }).click();
    await expect(page.getByRole('table', { name: 'Pantallas revocadas' })).toContainText(SCREEN_NAME);
    await expect(page.getByText('Esta sede no tiene pantallas')).toBeVisible();

    await expect(tvPage.getByRole('heading', { name: 'Esta pantalla ya no está activa' })).toBeVisible({
      timeout: 15_000,
    });
    expect(await axeViolations(tvPage, tvPage.locator('body'))).toEqual([]);
  } finally {
    await tv.close();
  }
});
