import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { expectTouchTarget } from './support/touch-targets';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-497: idioma preferido del paciente.
 *
 * - El ADMIN añade «English (en)» y «Català (ca)» en Ajustes › Idiomas de los
 *   pacientes; recepción no ve la entrada.
 * - Recepción ve esas opciones (y «Idioma de la clínica») en «Comunicaciones»
 *   de la ficha y guarda Català.
 * - Quitar ca de la lista no toca al paciente: su ficha dice «(no disponible) ca».
 * - La página pública de confirmar abre en el idioma del paciente (en) y deja
 *   cambiarlo sin tocar la ficha.
 * - Capturas a 390 y 1440 px en claro y oscuro (E2E_QA_DIR o el `outputDir`).
 *
 * En serie: cada test parte de lo que dejó el anterior.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `idiomas-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.idiomas.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.idiomas.${suffix}@example.com` };
const lastName = `Idioma${suffix.slice(0, 6)}`;

let session: ApiSession;
let patientId: string;
let englishPatientId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Idiomas ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Carolina',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `IC${suffix}`.slice(0, 20),
    sex: 'F',
    email: `carolina.${suffix}@example.com`,
  }));
});

const communication = (page: Page) => page.getByRole('region', { name: 'Comunicaciones' });

async function openSettings(page: Page) {
  await page.goto(`${origin}/settings/idiomas-de-pacientes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Idiomas de los pacientes' })).toBeVisible({
    timeout: 15_000,
  });
  const list = page.getByTestId('patient-languages');
  await expect(list).toBeVisible({ timeout: 15_000 });
  return list;
}

async function addLanguage(page: Page, code: string, name: string) {
  await page.getByRole('button', { name: 'Añadir idioma' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir un idioma' });
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByLabel('Código del idioma').fill(code);
  await expect(dialog.getByText(`Se verá como: ${name}`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Añadir' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole('status').filter({ hasText: `${name} añadido.` })).toBeVisible();
}

test('ADMIN añade English (en) y Català (ca) en Ajustes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  const list = await openSettings(page);
  await expect(list).toContainText('Español (es)');
  await expect(list).toContainText('Idioma de la clínica');
  await addLanguage(page, 'en', 'English (en)');
  await addLanguage(page, 'ca', 'Català (ca)');
  await expect(list).toContainText('English (en)');
  await expect(list).toContainText('Català (ca)');
});

test('RECEPCIÓN no ve la entrada de Ajustes y elige Català en la ficha', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/settings`);
  await expect(page.getByRole('main').getByRole('link').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: /Idiomas de los pacientes/ })).toHaveCount(0);

  await page.goto(`${origin}/patients/${patientId}`);
  const block = communication(page);
  await expect(block.getByTestId('patient-preferred-language')).toHaveText('Idioma de la clínica', {
    timeout: 15_000,
  });
  await block.getByRole('button', { name: 'Editar comunicaciones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones del paciente' });
  const select = dialog.getByLabel('Idioma de los mensajes');
  await expect(select.getByRole('option')).toHaveText([
    'Idioma de la clínica · Español (es)',
    'English (en)',
    'Català (ca)',
  ]);
  await select.selectOption('ca');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(block.getByTestId('patient-preferred-language')).toHaveText('Català (ca)');
});

test('la auditoría dice el idioma antes y después y quién lo cambió', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/auditoria`);
  const table = page.getByRole('table', { name: 'Registro de auditoría' });
  await expect(table).toBeVisible({ timeout: 15_000 });
  // La flecha va con « a » solo para lectores de pantalla.
  const row = table.getByRole('row').filter({ hasText: /Idioma de los mensajes:\s*Idioma de la clínica.*Català \(ca\)/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(reception.fullName);
});

test('quitar ca de la lista: el paciente lo conserva y su ficha dice «(no disponible) ca»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  const list = await openSettings(page);
  await page.getByRole('button', { name: 'Quitar Català (ca)' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Quitar Català (ca)?' });
  await expect(dialog).toContainText('Los pacientes que lo tienen lo conservan');
  await dialog.getByRole('button', { name: 'Quitar idioma' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(list).not.toContainText('Català (ca)');

  await page.goto(`${origin}/patients/${patientId}`);
  await expect(communication(page).getByTestId('patient-preferred-language')).toHaveText('(no disponible) ca', {
    timeout: 15_000,
  });
});

test('la página de confirmar abre en el idioma del paciente y se cambia sin tocar la ficha', async ({
  browser,
  request,
}) => {
  ({ id: englishPatientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Grace',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `IE${suffix}`.slice(0, 20),
    sex: 'F',
    preferredLanguage: 'en',
  }));
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
  }[];
  await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  const day = sedeDayFromToday(3);
  const appt = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: englishPatientId,
    providerId: staff[0].userId,
    start: atSede(day, '10:00').toISOString(),
    end: atSede(day, '10:30').toISOString(),
  });
  const link = await apiPost<{ url: string }>(request, session, `/appointments/${appt.id}/confirmation-link`, {});

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const patientPage = await context.newPage();
  await patientPage.goto(link.url);
  await expect(patientPage.getByText(/Hello Grace,/)).toBeVisible({ timeout: 15_000 });
  await expect(patientPage.getByRole('button', { name: 'Confirm attendance' })).toBeVisible();
  await expect(patientPage.locator('html')).toHaveAttribute('lang', 'en');
  const language = patientPage.getByLabel('Language');
  await expectTouchTarget(language);
  await language.selectOption('es');
  await expect(patientPage.getByText(/Hola Grace,/)).toBeVisible();
  await expect(patientPage.getByRole('button', { name: 'Confirmar asistencia' })).toBeVisible();
  await context.close();

  const res = await request.get(`${API_URL}/patients/${englishPatientId}/communication`, {
    headers: session.headers,
  });
  expect(((await res.json()) as { preferredLanguage: string | null }).preferredLanguage).toBe('en');
});

test('capturas a 390 y 1440 px en claro y oscuro: ajustes, diálogo, ficha y página pública', async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const evidence = process.env.E2E_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(evidence, { recursive: true });
  const shot = (p: Page, view: string, width: number, theme: string) =>
    p.screenshot({ path: path.join(evidence, `dx497-${view}-${width}-${theme}.png`) });

  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
  }[];
  const day = sedeDayFromToday(4);
  const appt = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: englishPatientId,
    providerId: staff[0].userId,
    start: atSede(day, '11:00').toISOString(),
    end: atSede(day, '11:30').toISOString(),
  });
  const link = await apiPost<{ url: string }>(request, session, `/appointments/${appt.id}/confirmation-link`, {});

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);

  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });

      await openSettings(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
      await shot(page, 'ajustes', width, theme);

      await page.getByRole('button', { name: 'Añadir idioma' }).click();
      const dialog = page.getByRole('dialog', { name: 'Añadir un idioma' });
      await expectDialogInsideViewport(page, dialog);
      await dialog.getByLabel('Código del idioma').fill('pt');
      if (width < 640) {
        for (const target of [dialog.getByRole('button', { name: 'Añadir' }), dialog.getByLabel('Código del idioma')]) {
          await expectTouchTarget(target, { scope: dialog });
        }
      }
      await shot(page, 'dialogo', width, theme);
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();

      await page.goto(`${origin}/patients/${patientId}`);
      const value = communication(page).getByTestId('patient-preferred-language');
      await expect(value).toBeVisible({ timeout: 15_000 });
      await value.scrollIntoViewIfNeeded();
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
      await shot(page, 'ficha', width, theme);

      const context = await browser.newContext({
        viewport: { width, height: width < 768 ? 844 : 900 },
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      const patientPage = await context.newPage();
      await patientPage.goto(link.url);
      await expect(patientPage.getByText(/Hello Grace,/)).toBeVisible({ timeout: 15_000 });
      await expectNoHorizontalScroll(patientPage);
      await shot(patientPage, 'publica', width, theme);
      await context.close();
    }
  }
});
