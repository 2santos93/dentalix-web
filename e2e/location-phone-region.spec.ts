import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { chooseCountry, E2E_REGION, pickRegional, type RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { phoneRegionLabel } from '../src/lib/locations/phone-regions';

/**
 * e2e DX-329: el prefijo telefónico por defecto de la sede y el móvil en
 * formato internacional. El navegador va con el idioma de la suite (`es`, sin
 * región). Cada escenario tiene su clínica, con una sola sede salvo la del
 * alta, para que la sede activa no dependa de nada.
 *
 * 1. Alta de una sede con su país: el prefijo de ese país sale marcado
 *    «Sugerido por el país de la sede.» y la API lo guarda.
 * 2. El ADMIN busca «+39» en el prefijo de esa sede, elige Italia y la API lo
 *    guarda.
 * 3. El ADMIN deja la sede «Sin prefijo por defecto»: un móvil sin + con
 *    WhatsApp lo rechaza la API, y con + se guarda.
 * 4. El bloque de comunicaciones pinta el móvil en formato internacional y la
 *    pista nombra el prefijo de la sede.
 * 5. En una sede con otro prefijo, un número que se lee de dos formas pide
 *    escribirlo con +; con + se guarda (pre-flight C1).
 *
 * Capturas a 1440 y 390 px, claro y oscuro, en E2E_QA_DIR si está definido; a
 * 390 px, sin scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;
const PREFIX = 'Prefijo telefónico por defecto';
const SUGGESTED = 'Sugerido por el país de la sede.';
const NO_PREFIX = 'Sin prefijo por defecto';
// El texto exacto lo da la API; aquí importa que va junto al campo «Móvil».
const NEEDS_MOBILE = /móvil válido/;
const AMBIGUOUS = /se puede leer de dos formas/;

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

interface Clinic {
  origin: string;
  email: string;
  session: ApiSession;
}

const clinics = {} as Record<'sedes' | 'sinPrefijo' | 'pista' | 'ambiguo', Clinic>;

test.describe.configure({ mode: 'serial' });

/**
 * Recorre 1440 y 390 px: a 390 comprueba que no hay scroll horizontal y, con
 * E2E_QA_DIR, guarda `${name}-${width}-${scheme}.png` en claro y oscuro. Deja
 * la página a 1440. `target` se desplaza a la vista en cada ancho.
 */
async function shot(page: Page, name: string, target?: Locator): Promise<void> {
  if (QA_DIR) mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await target?.evaluate((el) => el.scrollIntoView({ block: 'center' }));
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

async function registerClinic(
  request: Parameters<typeof registerClinicViaApi>[0],
  key: string,
  location: RegionalSettings,
): Promise<Clinic> {
  const subdomain = `prefijo-${key}-${suffix}`;
  const email = `admin.prefijo.${key}.${suffix}@example.com`;
  const session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Prefijo ${key} ${suffix}`,
    fullName: 'Valeria Titular',
    email,
    password,
    location,
  });
  return { origin: tenantOrigin(subdomain), email, session };
}

type StoredLocation = { id: string; name: string; defaultPhoneRegion: string | null };

async function locationsOf(request: Parameters<typeof registerClinicViaApi>[0], clinic: Clinic): Promise<StoredLocation[]> {
  const res = await request.get(`${API_URL}/locations`, { headers: clinic.session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as StoredLocation[];
}

function prefixField(scope: Locator): Locator {
  return scope.getByRole('combobox', { name: PREFIX, exact: true });
}

/** Abre «Editar» (o «Revisar») de la sede `name` en Ajustes › Sedes. */
async function editLocation(page: Page, clinic: Clinic, name: string): Promise<Locator> {
  await page.goto(`${clinic.origin}/settings/sedes`);
  const row = page.getByRole('region', { name: 'Sedes de la clínica' }).getByRole('listitem').filter({ hasText: name });
  await row.getByRole('button', { name: new RegExp(`^(?:Editar|Revisar) ${name}$`) }).click();
  const dialog = page.getByRole('dialog', { name: /^(?:Editar|Revisar) sede/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createPatient(request: Parameters<typeof registerClinicViaApi>[0], clinic: Clinic, key: string): Promise<string> {
  const { id } = await apiPost<{ id: string }>(request, clinic.session, '/patients', {
    firstName: 'Mariela',
    lastName: `Prefijo${key}${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `PF${key}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  return id;
}

/** Abre el modal del bloque «Comunicaciones» de la ficha. */
async function openCommunication(page: Page, clinic: Clinic, patientId: string): Promise<{ block: Locator; dialog: Locator }> {
  await page.goto(`${clinic.origin}/patients/${patientId}`);
  const block = page.getByRole('region', { name: 'Comunicaciones' });
  await expect(block.getByRole('button', { name: 'Editar comunicaciones' })).toBeVisible({ timeout: 15_000 });
  await block.getByRole('button', { name: 'Editar comunicaciones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones del paciente' });
  await expect(dialog).toBeVisible();
  return { block, dialog };
}

/**
 * Pasa a WhatsApp con `phone`: sin la aceptación, la API decide si el número
 * sirve; con ella, se guarda.
 */
async function saveWhatsApp(dialog: Locator, phone: string, optIn: boolean): Promise<void> {
  await dialog.getByLabel('Móvil').fill(phone);
  await dialog.getByLabel('Canal de los recordatorios').selectOption('WHATSAPP');
  if (optIn) await dialog.getByLabel('Acepta que la clínica le escriba por WhatsApp').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
}

/** El 400 del móvil va junto a «Móvil», con el foco, y no arriba del diálogo. */
async function expectMobileError(dialog: Locator, message: RegExp): Promise<void> {
  const mobile = dialog.getByLabel('Móvil');
  await expect(mobile).toHaveAccessibleDescription(message);
  await expect(mobile).toHaveAttribute('aria-invalid', 'true');
  await expect(mobile).toBeFocused();
  await expect(dialog.getByRole('alert')).toHaveCount(1);
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  clinics.sedes = await registerClinic(request, 'sedes', VENEZUELA);
  clinics.sinPrefijo = await registerClinic(request, 'sin', VENEZUELA);
  clinics.pista = await registerClinic(request, 'pista', VENEZUELA);
  clinics.ambiguo = await registerClinic(request, 'amb', E2E_REGION);
});

test('creating a location suggests the prefix of its country and saves it', async ({ page, request }) => {
  const clinic = clinics.sedes;
  await loginAs(page, clinic.origin, clinic.email, password);
  await page.goto(`${clinic.origin}/settings/sedes`);
  await page.getByRole('button', { name: 'Nueva sede' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva sede' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nombre', { exact: true }).fill('Sede Norte');
  await chooseCountry(dialog, VENEZUELA.country);
  const prefix = prefixField(dialog);
  await expect(prefix).toHaveValue(phoneRegionLabel(VENEZUELA.country)!);
  await expect(prefix).toHaveValue('Venezuela (+58)');
  await expect(prefix).toHaveAccessibleDescription(new RegExp(`^${SUGGESTED.replace('.', '\\.')}`));
  await dialog.getByLabel('Moneda', { exact: true }).selectOption(VENEZUELA.currency);
  await pickRegional(dialog.getByLabel('Zona horaria', { exact: true }), VENEZUELA.timeZone);
  await pickRegional(dialog.getByLabel('Formato regional', { exact: true }), VENEZUELA.locale);
  await dialog.getByRole('radio', { name: '12 h', exact: true }).check();
  await shot(page, 'phone-region-suggested', prefix);

  const created = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/api/v1/locations'),
  );
  await dialog.getByRole('button', { name: 'Crear sede' }).click();
  expect((await created).postDataJSON()).toMatchObject({ name: 'Sede Norte', defaultPhoneRegion: 'VE' });
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  const stored = (await locationsOf(request, clinic)).find((l) => l.name === 'Sede Norte');
  expect(stored?.defaultPhoneRegion).toBe('VE');
});

test('an admin picks another prefix by searching its calling code', async ({ page, request }) => {
  const clinic = clinics.sedes;
  await loginAs(page, clinic.origin, clinic.email, password);
  const dialog = await editLocation(page, clinic, 'Sede Norte');
  const prefix = prefixField(dialog);
  await expect(prefix).toHaveValue(phoneRegionLabel('VE')!);
  await prefix.clear();
  await prefix.fill('+39');
  const list = dialog.getByRole('listbox', { name: 'Prefijos telefónicos' });
  const italy = list.getByRole('option', { name: phoneRegionLabel('IT')!, exact: true });
  await expect(italy).toBeVisible();
  await expect(list.getByRole('option', { name: NO_PREFIX })).toHaveCount(0);
  await shot(page, 'phone-region-search', prefix);

  await italy.click();
  await expect(prefix).toHaveValue(phoneRegionLabel('IT')!);
  await expect(prefix).not.toHaveAccessibleDescription(new RegExp(SUGGESTED.replace('.', '\\.')));
  const saved = page.waitForRequest((req) => req.method() === 'PATCH' && /\/api\/v1\/locations\//.test(req.url()));
  await dialog.getByRole('button', { name: 'Guardar sede' }).click();
  expect((await saved).postDataJSON()).toMatchObject({ defaultPhoneRegion: 'IT' });
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  const stored = (await locationsOf(request, clinic)).find((l) => l.name === 'Sede Norte');
  expect(stored?.defaultPhoneRegion).toBe('IT');
});

test('an admin clears the prefix and a number without + is then refused', async ({ page, request }) => {
  const clinic = clinics.sinPrefijo;
  const [main] = await locationsOf(request, clinic);
  expect(main.defaultPhoneRegion).toBe('VE');
  const patientId = await createPatient(request, clinic, 'sin');
  await loginAs(page, clinic.origin, clinic.email, password);

  const location = await editLocation(page, clinic, main.name);
  const prefix = prefixField(location);
  await prefix.clear();
  await location.getByRole('option', { name: NO_PREFIX, exact: true }).click();
  await expect(prefix).toHaveValue(NO_PREFIX);
  await location.getByRole('button', { name: 'Guardar sede' }).click();
  await expect(location).toBeHidden({ timeout: 10_000 });
  expect((await locationsOf(request, clinic))[0].defaultPhoneRegion).toBeNull();

  const { block, dialog } = await openCommunication(page, clinic, patientId);
  await expect(dialog).toContainText('Escríbelo con + y su prefijo.');
  await saveWhatsApp(dialog, '0412-1234567', false);
  await expectMobileError(dialog, NEEDS_MOBILE);

  await saveWhatsApp(dialog, '+58 412 1234567', true);
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(block).toContainText('+58 412 1234567');
  await expect(block.getByText('Móvil válido')).toBeVisible();
});

test("the communication block shows the international format and the location's prefix", async ({ page, request }) => {
  const clinic = clinics.pista;
  const patientId = await createPatient(request, clinic, 'pista');
  await loginAs(page, clinic.origin, clinic.email, password);
  const hint = `Sin + se usa el prefijo de la sede: ${phoneRegionLabel('VE')}. Se guarda en formato internacional.`;
  expect(hint).toContain('Venezuela (+58)');

  let { block, dialog } = await openCommunication(page, clinic, patientId);
  await expect(dialog).toContainText(hint);
  await dialog.getByLabel('Móvil').fill('0412-1234567');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(block).toContainText('+58 412 1234567');
  await expect(block.getByText('Móvil válido')).toBeVisible();
  const res = await request.get(`${API_URL}/patients/${patientId}/communication`, { headers: clinic.session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  expect(await res.json()).toMatchObject({ phoneE164: '+584121234567', phoneInternational: '+58 412 1234567', phoneCountry: 'VE' });

  ({ block, dialog } = await openCommunication(page, clinic, patientId));
  await expect(dialog).toContainText(hint);
  await shot(page, 'phone-region-hint', dialog.getByLabel('Móvil'));
});

test('an ambiguous number asks to write it with +', async ({ page, request }) => {
  const clinic = clinics.ambiguo;
  const [main] = await locationsOf(request, clinic);
  expect(main.defaultPhoneRegion).toBe(E2E_REGION.country);
  const patientId = await createPatient(request, clinic, 'amb');
  await loginAs(page, clinic.origin, clinic.email, password);

  const { block, dialog } = await openCommunication(page, clinic, patientId);
  await saveWhatsApp(dialog, '0058 412 1234567', false);
  await expectMobileError(dialog, AMBIGUOUS);

  await saveWhatsApp(dialog, '+58 412 1234567', true);
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(block).toContainText('+58 412 1234567');
  await expect(block.getByText('Móvil válido')).toBeVisible();
});
