import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import {
  addStaffViaApi,
  apiPost,
  createLocationViaApi,
  registerClinicViaApi,
  type ApiSession,
} from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-486: «Atender sin cita» con «Todas las sedes» en una clínica de 2
 * sedes (FE-099, FE-101, FE-107).
 *
 * Clínica nueva por corrida (no toca la demo: nada que retirar para el
 * teardown global): la sede principal y «Sede Norte»; un odontólogo acotado
 * a cada una; recepción sin acotar; el tipo urgente y sin huecos reservados
 * (la API pide el motivo del sobrecupo, como en `walk-in.spec.ts`).
 * 1. 1440 px, agenda en «Todas las sedes»: el diálogo pide la sede; «Atender»
 *    sin rellenar deja el foco en ella; elegida Norte solo ofrece a su
 *    odontóloga; la urgencia sale en «En clínica» de Norte y no en la principal.
 * 2. 390 px, agenda en «Todas las sedes»: «En clínica» › «Elegir sede» deja el
 *    foco en el selector de sede del teléfono.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `sincitasedes-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.wis.${suffix}@example.com` };
const dentistMain = { fullName: 'Óscar Principal', email: `oscar.wis.${suffix}@example.com` };
const dentistNorth = { fullName: 'Nora Norte', email: `nora.wis.${suffix}@example.com` };
const reception = { fullName: 'Rosa Mostrador', email: `rosa.wis.${suffix}@example.com` };
const NORTE = 'Sede Norte';
const lastName = `SedeNorte${suffix}`.slice(0, 40);

let session: ApiSession;
let mainName = '';

test.describe.configure({ mode: 'serial' });

async function apiGet<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${API_URL}${path}`, { headers: session.headers });
  expect(res.ok(), `GET ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Acota a una persona del equipo a una sede (`PUT /staff/:id/locations`). */
async function restrictTo(request: APIRequestContext, email: string, locationId: string): Promise<void> {
  const staff = await apiGet<{ userId: string; email: string }[]>(request, '/staff');
  const member = staff.find((s) => s.email === email);
  expect(member, `no aparece ${email} en el equipo`).toBeTruthy();
  const res = await request.put(`${API_URL}/staff/${member!.userId}/locations`, {
    headers: session.headers,
    data: { locationIds: [locationId] },
  });
  expect(res.ok(), `acotar a ${email} falló: ${await res.text()}`).toBeTruthy();
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Dos Sedes ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  const northId = await createLocationViaApi(request, session, { name: NORTE, ...E2E_REGION });
  const main = (await apiGet<{ id: string; name: string }[]>(request, '/locations')).find((l) => l.id !== northId);
  expect(main, 'la clínica nace con su sede principal').toBeTruthy();
  mainName = main!.name;

  await addStaffViaApi(request, session, { ...dentistMain, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...dentistNorth, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await restrictTo(request, dentistMain.email, main!.id);
  await restrictTo(request, dentistNorth.email, northId);
  await apiPost(request, session, '/appointment-types', {
    name: 'Consulta de urgencia',
    durationMinutes: 30,
    color: '#DC2626',
    isUrgent: true,
  });
});

/** «En clínica» de una sede: se elige en el selector global (recarga la vista). */
async function openInClinicAt(page: Page, sedeName: string) {
  await page.goto(`${origin}/agenda/en-clinica`);
  const switcher = page.getByRole('combobox', { name: 'Sede', exact: true });
  await switcher.selectOption({ label: sedeName });
  // Cambiar de sede recarga la vista: se espera a que vuelva con ella elegida.
  await page.waitForLoadState('load');
  await expect(switcher.locator('option:checked')).toHaveText(sedeName, { timeout: 15_000 });
}

test('1440: con «Todas las sedes» pide la sede, filtra profesionales y la urgencia queda en «En clínica» de Norte', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await expect(page.getByRole('combobox', { name: 'Sede', exact: true })).toHaveValue('');

  await page.getByRole('button', { name: 'Atender sin cita' }).click();
  const dialog = page.getByRole('dialog', { name: 'Atender sin cita' });
  const sede = dialog.getByRole('combobox', { name: 'Sede', exact: true });
  await expect(sede.getByRole('option', { name: NORTE })).toBeAttached({ timeout: 10_000 });
  await expect(dialog.getByLabel('Profesional', { exact: true })).toBeDisabled();

  // FE-101: «Atender» con errores → foco en el primer campo inválido (la sede).
  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();
  await expect(sede).toBeFocused();
  await expect(sede).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('Elige la sede.')).toBeVisible();

  // FE-099: solo quien atiende en Norte (y administración, que atiende en todas).
  await sede.selectOption({ label: NORTE });
  const provider = dialog.getByLabel('Profesional', { exact: true });
  await expect(provider.getByRole('option', { name: dentistNorth.fullName })).toBeAttached();
  await expect(provider.getByRole('option', { name: dentistMain.fullName })).toHaveCount(0);

  await dialog.getByRole('radio', { name: 'Paciente nuevo' }).click();
  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();
  await expect(dialog.getByLabel('Nombre', { exact: true })).toBeFocused();
  await expect(dialog.getByText('Escribe el nombre.')).toBeVisible();
  await expect(dialog.getByText('Escribe el apellido.')).toBeVisible();

  await dialog.getByLabel('Nombre', { exact: true }).fill('Nuria');
  await dialog.getByLabel('Apellido', { exact: true }).fill(lastName);
  await dialog.getByLabel('Teléfono', { exact: true }).fill('+57 300 555 0110');
  await provider.selectOption({ label: dentistNorth.fullName });
  await dialog.getByRole('checkbox', { name: 'Dolor' }).check();
  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();

  const reason = dialog.getByLabel('Motivo del sobrecupo');
  await expect(reason).toBeFocused({ timeout: 10_000 });
  await reason.fill('Dolor agudo, no puede esperar');
  await dialog.getByRole('button', { name: 'Atender en sobrecupo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const name = `Nuria ${lastName}`;
  await openInClinicAt(page, NORTE);
  const row = page.getByTestId('in-clinic-item').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText(dentistNorth.fullName);
  await expect(row.getByRole('list', { name: `Señales de triaje de ${name}` }).getByRole('listitem')).toHaveText([
    'Urgencia',
    'Sin cita',
    'Sobrecupo',
    'Dolor',
  ]);

  // Con la sede activa, el diálogo la nombra en vez de pedirla.
  await page.getByRole('button', { name: 'Atender sin cita' }).click();
  const named = page.getByRole('dialog', { name: 'Atender sin cita' });
  await expect(named.getByTestId('walk-in-location')).toHaveText(`Se atiende en ${NORTE}.`);
  await expect(named.getByRole('combobox', { name: 'Sede', exact: true })).toHaveCount(0);
  await named.getByRole('button', { name: 'Cancelar' }).click();

  // Y no está en la otra sede.
  await openInClinicAt(page, mainName);
  await expect(page.getByText('Nadie en espera').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('in-clinic-item').filter({ hasText: name })).toHaveCount(0);
});

test('390: «En clínica» › «Elegir sede» deja el foco en el selector de sede del teléfono', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);

  await page.getByRole('button', { name: /^En clínica/ }).click();
  const choose = page.getByRole('button', { name: 'Elegir sede' });
  await expect(choose).toBeVisible({ timeout: 15_000 });
  await choose.click();

  const phoneSwitcher = page.getByRole('combobox', { name: /^Sede: / });
  await expect(phoneSwitcher).toBeFocused();
  await expect(phoneSwitcher).toHaveAccessibleName('Sede: Todas las sedes');
  await expectNoHorizontalScroll(page);
});
