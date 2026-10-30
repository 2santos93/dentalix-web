import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs, waitForHydratedForm } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { registrationTokenFor } from './support/mail';
import { chooseCountry, E2E_BROWSER_LOCALE, type RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-312: el país de la sede es un código ISO 3166 libre, elegido en un
 * combobox con búsqueda entre todos los países.
 *
 * 1. Registro por la UI de una clínica en VE (fuera del antiguo par): «venez»
 *    encuentra Venezuela; VES, America/Caracas, es-VE y 12 h. Tras confirmar,
 *    Ajustes › Sedes dice «Venezuela».
 * 2. Un navegador en `es-VE` (el único test de la suite con un idioma con
 *    región) sugiere Venezuela con su marca; elegir otro país la quita.
 * 3. El navegador de la suite (`es`, sin región) no sugiere ningún país, ni en
 *    el registro ni en el alta de una sede.
 * 4. En una sede VE, la pista del móvil nombra Venezuela y un móvil sin
 *    indicativo se guarda con el de Venezuela.
 * 5. El ADMIN busca «cote», elige Côte d’Ivoire y la lista muestra el nombre.
 * 6. La lista abierta y vacía ofrece los 250 países.
 *
 * Capturas a 1440 y 390 px, claro y oscuro, en E2E_QA_DIR si está definido; a
 * 390 px, sin scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `pais-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.pais.${suffix}@example.com`;
const QA_DIR = process.env.E2E_QA_DIR;
const SUGGESTED = 'Sugerido por tu navegador.';

const VENEZUELA: RegionalSettings = {
  country: 'VE',
  currency: 'VES',
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
};

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

/**
 * Recorre 1440 y 390 px: a 390 comprueba que no hay scroll horizontal y, con
 * E2E_QA_DIR, guarda `${name}-${width}-${scheme}.png` en claro y oscuro. Deja
 * la página a 1440. `target` se desplaza a la vista en cada ancho.
 */
async function shoot(page: Page, name: string, target?: Locator): Promise<void> {
  if (QA_DIR) mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await target?.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    if (!QA_DIR) continue;
    // Sin el hover del último clic y sin transiciones de color a medias.
    await page.mouse.move(0, 0);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png`, fullPage: false });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

function countryField(scope: Page | Locator): Locator {
  return scope.getByRole('combobox', { name: 'País', exact: true });
}

/** Escribe `query` en «País» y elige la opción `name` de la lista. */
async function searchCountry(scope: Page | Locator, query: string, name: string): Promise<void> {
  const field = countryField(scope);
  await field.clear();
  await field.fill(query);
  await scope.getByRole('option', { name, exact: true }).click();
  await expect(field).toHaveValue(name);
}

/** La fila de una sede en Ajustes › Sedes. */
function locationRow(page: Page, name: string): Locator {
  return page.getByRole('region', { name: 'Sedes de la clínica' }).getByRole('listitem').filter({ hasText: name });
}

async function openNewLocation(page: Page): Promise<Locator> {
  await page.goto(`${origin}/settings/sedes`);
  await page.getByRole('button', { name: 'Nueva sede' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva sede' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica País ${suffix}`,
    fullName: 'Valeria Titular',
    email: adminEmail,
    password,
    location: VENEZUELA,
  });
});

test('registering a clinic in a country outside the old pair', async ({ page, request }) => {
  test.setTimeout(120_000);
  const sub = `pais-reg-${suffix}`;
  const regOrigin = tenantOrigin(sub);
  const email = `registro.pais.${suffix}@example.com`;

  await page.goto(`${regOrigin}/register`);
  await waitForHydratedForm(page);
  await page.getByLabel('Nombre de la clínica').fill(`Clínica Caracas ${suffix}`);
  await page.getByLabel('Subdominio').fill(sub);
  await page.getByLabel('Nombre completo').fill('Andrés Registro');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await searchCountry(page, 'venez', 'Venezuela');
  await page.getByLabel('Moneda', { exact: true }).selectOption(VENEZUELA.currency);
  await page.getByLabel('Zona horaria', { exact: true }).fill(VENEZUELA.timeZone);
  await page.getByLabel('Formato regional', { exact: true }).fill(VENEZUELA.locale);
  await page.getByRole('radio', { name: '12 h', exact: true }).check();
  await shoot(page, 'register-country', page.getByRole('group', { name: 'Tu sede' }));

  const sent = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/api/v1/auth/register'),
  );
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    locationCountry: VENEZUELA.country,
    locationCurrency: VENEZUELA.currency,
    locationTimeZone: VENEZUELA.timeZone,
    locationLocale: VENEZUELA.locale,
    locationHourCycle: VENEZUELA.hourCycle,
  });
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible({ timeout: 10_000 });

  const token = await registrationTokenFor(email);
  const verify = await request.post(`${API_URL}/auth/register/verify`, { data: { token, password } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const regSession = await apiLogin(request, regOrigin, email, password);
  const res = await request.get(`${API_URL}/locations`, { headers: regSession.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  const [location] = (await res.json()) as (RegionalSettings & { name: string })[];
  expect(location).toMatchObject({ ...VENEZUELA });

  await loginAs(page, regOrigin, email, password);
  await page.goto(`${regOrigin}/settings/sedes`);
  const row = locationRow(page, location.name);
  await expect(row).toContainText('Venezuela', { timeout: 15_000 });
  await shoot(page, 'locations-list', page.getByRole('region', { name: 'Sedes de la clínica' }));
});

test.describe('a browser in es-VE', () => {
  test.use({ locale: 'es-VE' });

  test('a browser in es-VE suggests Venezuela with its mark', async ({ page }) => {
    await page.goto(`${tenantOrigin(`pais-ve-${suffix}`)}/register`);
    await waitForHydratedForm(page);
    expect(await page.evaluate(() => navigator.languages[0])).toBe('es-VE');
    const country = countryField(page);
    await expect(country).toHaveValue('Venezuela');
    await expect(country).toHaveAccessibleDescription(new RegExp(`^${SUGGESTED}`));

    await chooseCountry(page, 'JP');
    await expect(country).not.toHaveAccessibleDescription(new RegExp(SUGGESTED));
  });
});

test('the suite browser suggests no country', async ({ page }) => {
  await page.goto(`${tenantOrigin(`pais-es-${suffix}`)}/register`);
  await waitForHydratedForm(page);
  expect(await page.evaluate(() => [...navigator.languages])).toEqual([E2E_BROWSER_LOCALE]);
  await expect(countryField(page)).toHaveValue('');
  await expect(countryField(page)).not.toHaveAccessibleDescription(new RegExp(SUGGESTED));

  await loginAs(page, origin, adminEmail, password);
  const dialog = await openNewLocation(page);
  await expect(countryField(dialog)).toHaveValue('');
  await expect(countryField(dialog)).not.toHaveAccessibleDescription(new RegExp(SUGGESTED));
});

test("a location's phone hint names its country", async ({ page, request }) => {
  const { id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Mariela',
    lastName: `Pais${suffix}`,
    docType: 'NATIONAL_ID',
    docNumber: `VE${suffix}`.slice(0, 20),
    sex: 'F',
  });
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/patients/${patientId}`);
  const block = page.getByRole('region', { name: 'Comunicaciones' });
  await expect(block.getByText('Sin móvil registrado')).toBeVisible({ timeout: 15_000 });
  await block.getByRole('button', { name: 'Editar comunicaciones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones del paciente' });
  const phone = dialog.getByLabel('Móvil');
  await expect(dialog).toContainText('Sin + se usa el prefijo de la sede: Venezuela (+58). Se guarda en formato internacional.');
  await phone.fill('0412-1234567');
  await shoot(page, 'phone-hint', phone);

  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(block.getByText('Móvil válido')).toBeVisible();
  const res = await request.get(`${API_URL}/patients/${patientId}/communication`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  expect(((await res.json()) as { phoneE164: string | null }).phoneE164).toBe('+584121234567');
});

test('an admin finds a country by searching and saves the location', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  const dialog = await openNewLocation(page);
  await dialog.getByLabel('Nombre', { exact: true }).fill('Sede Abiyán');
  const field = countryField(dialog);
  await field.fill('cote');
  const list = dialog.getByRole('listbox', { name: 'Países' });
  await expect(list.getByRole('option', { name: 'Côte d’Ivoire', exact: true })).toBeVisible();
  await shoot(page, 'location-country-search', field);

  await list.getByRole('option', { name: 'Côte d’Ivoire', exact: true }).click();
  await expect(field).toHaveValue('Côte d’Ivoire');
  await dialog.getByLabel('Moneda', { exact: true }).selectOption('XOF');
  await dialog.getByLabel('Zona horaria', { exact: true }).fill('Africa/Abidjan');
  await dialog.getByLabel('Formato regional', { exact: true }).fill('fr-CI');
  await dialog.getByRole('radio', { name: '24 h', exact: true }).check();
  const created = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/api/v1/locations'),
  );
  await dialog.getByRole('button', { name: 'Crear sede' }).click();
  expect((await created).postDataJSON()).toMatchObject({ name: 'Sede Abiyán', country: 'CI' });
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(locationRow(page, 'Sede Abiyán')).toContainText('Côte d’Ivoire');
});

test('the picker lists every country', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  const dialog = await openNewLocation(page);
  const field = countryField(dialog);
  await expect(field).toHaveValue('');
  await field.click();
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByRole('listbox', { name: 'Países' }).getByRole('option')).toHaveCount(250);
});
