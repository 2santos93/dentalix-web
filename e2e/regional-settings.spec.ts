import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiLogin, registerClinicViaApi, type ApiSession } from './support/api';
import { fillRegistrationLocation, loginAs, waitForHydratedForm } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { registrationTokenFor } from './support/mail';
import { E2E_REGION, type RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e GLOBAL-G1 (DX-313, DX-314, DX-317): moneda, zona y formato por sede.
 *
 * 1. El ADMIN da de alta desde el modal una sede en JPY / Asia/Tokyo / ja-JP
 *    (lo que viaja en el POST es exactamente lo elegido); el selector de sede
 *    la lista SIN recargar la página, la elige y la caja le abre el fondo en JPY.
 * 2. Registro por la UI, sin sesión: país y moneda empiezan vacíos, zona y
 *    formato traen la sugerencia del navegador, las monedas salen de la lista
 *    pública y la sede nace con los cuatro valores elegidos, ya revisada.
 * 3. Aviso D5: una clínica registrada en la forma legada (la de una web
 *    antigua, sin los campos de sede) nace con la sede rellenada por la
 *    función D5 y sin revisar. El ADMIN ve el aviso en el panel y en Ajustes →
 *    Sedes; «Revisar» → «Guardar sede» la confirma y el aviso desaparece.
 *
 * Cada caso a 1440 y a 390 px (sin scroll horizontal), con capturas en claro y
 * oscuro en E2E_QA_DIR si está definido.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;

const TOKYO: RegionalSettings = { country: 'CO', currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP', hourCycle: 'h23' };
const MADRID: RegionalSettings = { country: 'ES', currency: 'EUR', timeZone: 'Europe/Madrid', locale: 'es-ES', hourCycle: 'h23' };

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

interface LocationRow {
  id: string;
  name: string;
  country: string;
  currency: string | null;
  timeZone: string | null;
  locale: string | null;
  hourCycle: string | null;
  regionalSettingsReviewedAt: string | null;
}

/** Igual que `formatCurrency` de la web con un importe entero en una moneda sin decimales. */
function zeroDecimal(amount: number, currency: string): string {
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  // Sin el hover del último clic y sin transiciones de color a medias.
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: false });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function listLocations(request: APIRequestContext, session: ApiSession): Promise<LocationRow[]> {
  const res = await request.get(`${API_URL}/locations`, { headers: session.headers });
  expect(res.ok(), `GET /locations falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as LocationRow[];
}

/** El selector de sede visible (sidebar en escritorio, topbar en móvil). */
function locationSelect(page: Page) {
  return page.getByRole('combobox', { name: 'Sede' }).locator('visible=true').first();
}

/** Marca la ventana: si la página se recarga, la marca desaparece. */
async function markWindow(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __g1NoReload?: boolean }).__g1NoReload = true;
  });
}

async function expectSameWindow(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => (window as unknown as { __g1NoReload?: boolean }).__g1NoReload === true),
    'la página no se recargó',
  ).toBe(true);
}

/**
 * Registro en la forma LEGADA (web antigua): sin los cuatro `location*`. La API
 * nueva lo acepta y, al confirmarlo, la sede queda rellenada por la función D5
 * y sin revisar: el estado de una sede que trajo la migración.
 */
async function registerLegacyClinic(
  request: APIRequestContext,
  clinic: { subdomain: string; clinicName: string; fullName: string; email: string },
): Promise<ApiSession> {
  const origin = tenantOrigin(clinic.subdomain);
  const res = await request.post(`${API_URL}/auth/register`, {
    headers: { 'X-Tenant-Host': new URL(origin).host },
    data: { ...clinic, password },
  });
  expect(res.status(), `registro legado falló: ${await res.text()}`).toBe(202);
  const token = await registrationTokenFor(clinic.email);
  const verify = await request.post(`${API_URL}/auth/register/verify`, { data: { token, password } });
  expect(verify.ok(), `confirmar el registro legado falló: ${await verify.text()}`).toBeTruthy();
  return apiLogin(request, origin, clinic.email, password);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('el ADMIN crea una sede en JPY / Asia/Tokyo / ja-JP, la elige sin recargar y la caja abre en JPY', async ({
      page,
      request,
    }) => {
      test.setTimeout(120_000);
      const tag = `${suffix}${viewport.width}`;
      const email = `admin.tokio.${tag}@example.com`;
      const subdomain = `g1-tokio-${tag}`;
      const session = await registerClinicViaApi(request, {
        subdomain,
        clinicName: `Clínica Tokio ${tag}`,
        fullName: 'Aiko Titular',
        email,
        password,
      });
      const origin = session.origin;
      await loginAs(page, origin, email, password);

      await page.goto(`${origin}/settings/sedes`);
      await page.getByRole('button', { name: 'Nueva sede' }).click();
      const dialog = page.getByRole('dialog', { name: 'Nueva sede' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Nombre', { exact: true }).fill('Sede Tokio');
      await dialog.getByLabel('País', { exact: true }).selectOption(TOKYO.country);
      await dialog.getByLabel('Moneda', { exact: true }).selectOption(TOKYO.currency);
      await dialog.getByLabel('Zona horaria', { exact: true }).fill(TOKYO.timeZone);
      await dialog.getByLabel('Formato regional', { exact: true }).fill(TOKYO.locale);
      await dialog.getByRole('radio', { name: '24 h', exact: true }).check();
      if (viewport.width === 390) await expectDialogInsideViewport(page, dialog);
      await shoot(page, 'e2e-sede-tokio-modal', viewport.width);

      await markWindow(page);
      const created = page.waitForRequest(
        (req) => req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/api/v1/locations'),
      );
      await dialog.getByRole('button', { name: 'Crear sede' }).click();
      const body = (await created).postDataJSON() as Record<string, unknown>;
      expect(body).toMatchObject({
        name: 'Sede Tokio',
        country: TOKYO.country,
        currency: TOKYO.currency,
        timeZone: TOKYO.timeZone,
        locale: TOKYO.locale,
        hourCycle: TOKYO.hourCycle,
      });
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      const tokyo = (await listLocations(request, session)).find((l) => l.name === 'Sede Tokio')!;
      expect(tokyo).toMatchObject({ ...TOKYO });
      expect(tokyo.regionalSettingsReviewedAt, 'una sede nueva nace revisada').not.toBeNull();

      // Sin recargar, el selector ya la lista (`invalidate()` de las sedes de la
      // sesión). Elegirla sí recarga la vista, a propósito (LocationSwitcher).
      const select = locationSelect(page);
      await expect(select.locator('option', { hasText: 'Sede Tokio' })).toHaveCount(1, { timeout: 10_000 });
      await expectSameWindow(page);
      await select.selectOption(tokyo.id);
      await expect(locationSelect(page)).toHaveValue(tokyo.id, { timeout: 10_000 });
      await page.getByRole('link', { name: 'Caja', exact: true }).locator('visible=true').first().click();
      await expect(page).toHaveURL(/\/caja/);
      await page.getByRole('tab', { name: 'Turnos' }).click();
      await page.getByRole('button', { name: 'Abrir caja' }).first().click();
      const open = page.getByRole('dialog', { name: 'Abrir caja' });
      await expect(open).toBeVisible();
      await expect(open).toContainText('Sede Tokio');
      await expect(open.getByLabel('Moneda del fondo 1')).toHaveValue('JPY');
      await open.getByLabel('Importe del fondo 1').fill('5000');
      await open.getByRole('button', { name: 'Abrir caja' }).click();
      await expect(open).toBeHidden({ timeout: 10_000 });
      await expect(page.getByRole('main')).toContainText(zeroDecimal(5000, 'JPY'), { timeout: 10_000 });
      if (viewport.width === 390) await expectNoHorizontalScroll(page);
      await shoot(page, 'e2e-caja-jpy', viewport.width);
    });

    test('registro por la UI, sin sesión, con país, moneda, zona y formato', async ({ page, request }) => {
      test.setTimeout(90_000);
      const tag = `${suffix}${viewport.width}`;
      const email = `registro.g1.${tag}@example.com`;
      const subdomain = `g1-registro-${tag}`;
      const origin = tenantOrigin(subdomain);

      await page.goto(`${origin}/register`);
      await waitForHydratedForm(page);
      // País y moneda vacíos; zona y formato, sugeridos por el navegador.
      await expect(page.getByLabel('País', { exact: true })).toHaveValue('');
      await expect(page.getByLabel('Moneda', { exact: true })).toHaveValue('');
      await expect(page.getByLabel('Zona horaria', { exact: true })).toHaveValue(E2E_REGION.timeZone);
      await expect(page.getByLabel('Formato regional', { exact: true })).toHaveValue(E2E_REGION.locale);
      await expect(page.getByText('Sugerido por tu navegador.').first()).toBeVisible();
      // Sin sesión, la lista de monedas viene de GET /public/currencies (ISO completa).
      await expect(page.getByLabel('Moneda', { exact: true }).locator('option[value="JPY"]')).toHaveCount(1, {
        timeout: 10_000,
      });

      await page.getByLabel('Nombre de la clínica').fill(`Clínica Madrid ${tag}`);
      await page.getByLabel('Subdominio').fill(subdomain);
      await page.getByLabel('Nombre completo').fill('Lucía Registro');
      await page.getByLabel('Correo electrónico').fill(email);
      await page.getByLabel('Contraseña', { exact: true }).fill(password);
      await fillRegistrationLocation(page, MADRID);
      if (viewport.width === 390) await expectNoHorizontalScroll(page);
      await shoot(page, 'e2e-registro', viewport.width);

      const sent = page.waitForRequest(
        (req) => req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/api/v1/auth/register'),
      );
      await page.getByRole('button', { name: 'Crear cuenta' }).click();
      expect((await sent).postDataJSON()).toMatchObject({
        locationCountry: MADRID.country,
        locationCurrency: MADRID.currency,
        locationTimeZone: MADRID.timeZone,
        locationLocale: MADRID.locale,
        locationHourCycle: MADRID.hourCycle,
      });
      await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible({ timeout: 10_000 });

      const token = await registrationTokenFor(email);
      const verify = await request.post(`${API_URL}/auth/register/verify`, { data: { token, password } });
      expect(verify.ok(), await verify.text()).toBeTruthy();
      const session = await apiLogin(request, origin, email, password);
      const [location] = await listLocations(request, session);
      expect(location).toMatchObject({ ...MADRID });
      expect(location.regionalSettingsReviewedAt, 'la sede elegida en el registro nace revisada').not.toBeNull();
    });

    test('aviso D5: la sede sin revisar sale en el panel y desaparece al confirmarla', async ({ page, request }) => {
      test.setTimeout(120_000);
      const tag = `${suffix}${viewport.width}`;
      const email = `admin.d5.${tag}@example.com`;
      const session = await registerLegacyClinic(request, {
        subdomain: `g1-d5-${tag}`,
        clinicName: `Clínica Legada ${tag}`,
        fullName: 'Marta Legada',
        email,
      });
      const [legacy] = await listLocations(request, session);
      // Fixture: la función D5 la rellenó por el país (CO) y la dejó sin revisar.
      // G1-B: el reloj lo pone la función de G1-B, 24 h (el que la app mostraba).
      expect(legacy).toMatchObject({
        country: 'CO',
        currency: 'COP',
        timeZone: 'America/Bogota',
        locale: 'es-CO',
        hourCycle: 'h23',
      });
      expect(legacy.regionalSettingsReviewedAt).toBeNull();

      await loginAs(page, session.origin, email, password);
      await page.goto(`${session.origin}/dashboard`);
      const notice = page.getByRole('region', { name: 'Sedes por revisar' });
      await expect(notice).toBeVisible({ timeout: 15_000 });
      await expect(notice).toContainText('Revisa la moneda, la zona horaria, el formato y el reloj de 1 sede.');
      await expect(notice).toContainText(`${legacy.name}: COP · America/Bogota · es-CO · 24 h`);
      if (viewport.width === 390) await expectNoHorizontalScroll(page);
      await shoot(page, 'e2e-d5-panel', viewport.width);

      await notice.getByRole('link', { name: 'Revisar sedes' }).click();
      await expect(page).toHaveURL(/\/settings\/sedes$/);
      await expect(notice).toBeVisible();
      await shoot(page, 'e2e-d5-sedes', viewport.width);

      await page.getByRole('button', { name: `Revisar ${legacy.name}` }).click();
      const dialog = page.getByRole('dialog', { name: 'Editar sede' });
      await expect(dialog).toBeVisible();
      const saved = page.waitForRequest(
        (req) => req.method() === 'PATCH' && new URL(req.url()).pathname.endsWith(`/locations/${legacy.id}`),
      );
      await dialog.getByRole('button', { name: 'Guardar sede' }).click();
      expect((await saved).postDataJSON()).toMatchObject({ confirmRegionalSettings: true });
      await expect(dialog).toBeHidden({ timeout: 10_000 });
      // Sin recargar: el aviso y la marca «Por revisar» desaparecen.
      await expect(notice).toBeHidden({ timeout: 10_000 });
      await expect(page.getByText('Por revisar', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: `Editar ${legacy.name}` })).toBeVisible();
      await shoot(page, 'e2e-d5-revisada', viewport.width);

      const [reviewed] = await listLocations(request, session);
      expect(reviewed.regionalSettingsReviewedAt).not.toBeNull();
      await page.goto(`${session.origin}/dashboard`);
      await expect(page.getByRole('heading', { name: 'Ingresos del período' })).toBeVisible({ timeout: 15_000 });
      await expect(notice).toHaveCount(0);
    });
  });
}
