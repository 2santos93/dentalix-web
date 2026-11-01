import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-387: el teléfono con el formato internacional que calcula la API
 * (`phoneInternational ?? phone`) en la lista de pacientes, la cabecera de la
 * ficha, «Datos», «Responsable y familia» y el teléfono de la sede. Una
 * clínica con una sola sede de prefijo +58, para que la región no dependa de
 * nada.
 *
 * - Un número sin + se ve con el formato internacional de la sede.
 * - Uno que la API no lee se ve tal cual se guardó.
 * - Uno largo (con extensión) y un texto largo sin espacios no desbordan a
 *   390 px ni a 1440 px.
 *
 * Capturas a 1440 y 390 px, claro y oscuro, en E2E_QA_DIR si está definido.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;

const PREFIX_58: RegionalSettings = {
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

const NATIONAL = '0412-1234567';
const INTERNATIONAL = '+58 412 1234567';
const LONG_INTERNATIONAL = '+58 412 7654321 ext. 123456';
// Ni válido ni con espacios: la API devuelve null y la web lo pinta tal cual.
const UNREADABLE = '000111222333444555666777888999';
const CONTACT_NATIONAL = '0414-7654321';
const CONTACT_INTERNATIONAL = '+58 414 7654321';
const LOCATION_NATIONAL = '0212-5551234';

interface Clinic {
  origin: string;
  email: string;
  session: ApiSession;
}

let clinic: Clinic;
const patients = {} as Record<'national' | 'long' | 'unreadable', string>;
const lastName = `Formato${suffix}`.slice(0, 30);

test.describe.configure({ mode: 'serial' });

/**
 * Recorre 1440 y 390 px: en los dos anchos comprueba que ni la página ni
 * `<main>` se desplazan en horizontal y, con E2E_QA_DIR, guarda
 * `${name}-${width}-${scheme}.png` en claro y oscuro. Deja la página a 1440.
 */
async function shot(page: Page, name: string, target?: Locator): Promise<void> {
  if (QA_DIR) mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await target?.first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page);
    if (!QA_DIR) continue;
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

/** Lo que ocupa `locator` no se sale de su contenedor `within` por la derecha. */
/**
 * El borde derecho de `locator` no pasa del de `within`. Se espera a que el
 * diseño se asiente: justo tras `setViewportSize` la tarjeta del teléfono ya
 * es visible pero puede medirse aún con el ancho del escritorio (Z1: 530 px
 * a 390 en una corrida, verde en la siguiente). Misma cota, sin margen nuevo.
 */
async function expectInside(locator: Locator, within: Locator): Promise<void> {
  await expect
    .poll(
      async () => {
        const inner = await locator.boundingBox();
        const outer = await within.boundingBox();
        return inner && outer ? inner.x + inner.width - (outer.x + outer.width + 1) : Number.POSITIVE_INFINITY;
      },
      { message: 'la caja queda dentro de su contenedor' },
    )
    .toBeLessThanOrEqual(0);
}

async function createPatient(request: Parameters<typeof registerClinicViaApi>[0], key: string, phone: string): Promise<string> {
  const { id } = await apiPost<{ id: string }>(request, clinic.session, '/patients', {
    firstName: `Mariela ${key}`,
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `FI${key}${suffix}`.slice(0, 20),
    sex: 'F',
    phone,
  });
  return id;
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  const subdomain = `formato-${suffix}`;
  const email = `admin.formato.${suffix}@example.com`;
  const session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Formato ${suffix}`,
    fullName: 'Valeria Titular',
    email,
    password,
    location: PREFIX_58,
  });
  clinic = { origin: tenantOrigin(subdomain), email, session };

  patients.national = await createPatient(request, 'nac', NATIONAL);
  patients.long = await createPatient(request, 'larg', '04127654321 ext. 123456');
  patients.unreadable = await createPatient(request, 'ilegible', UNREADABLE);
  await apiPost<object>(request, clinic.session, `/patients/${patients.national}/responsible-parties`, {
    fullName: 'Luis Ortiz',
    phone: CONTACT_NATIONAL,
    relationship: 'FATHER',
  });
  await apiPost<object>(request, clinic.session, `/patients/${patients.national}/responsible-parties`, {
    fullName: 'Rosa Ortiz',
    phone: UNREADABLE,
    relationship: 'GRANDPARENT',
  });

  const locations = await request.get(`${API_URL}/locations`, { headers: clinic.session.headers });
  expect(locations.ok(), await locations.text()).toBeTruthy();
  const [main] = (await locations.json()) as { id: string; defaultPhoneRegion: string | null }[];
  expect(main.defaultPhoneRegion).toBe('VE');
  const saved = await request.patch(`${API_URL}/locations/${main.id}`, {
    headers: clinic.session.headers,
    data: { phone: LOCATION_NATIONAL },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();
});

test('the API answers phoneInternational, or null for a number it cannot read', async ({ request }) => {
  const read = async (id: string) => {
    const res = await request.get(`${API_URL}/patients/${id}`, { headers: clinic.session.headers });
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()) as { phone: string | null; phoneInternational: string | null };
  };
  expect(await read(patients.national)).toMatchObject({ phone: NATIONAL, phoneInternational: INTERNATIONAL });
  expect((await read(patients.long)).phoneInternational).toBe(LONG_INTERNATIONAL);
  expect(await read(patients.unreadable)).toMatchObject({ phone: UNREADABLE, phoneInternational: null });
});

test('the patient list shows the international format and the stored text, without overflowing', async ({ page }) => {
  await loginAs(page, clinic.origin, clinic.email, password);
  await page.goto(`${clinic.origin}/patients`);
  const table = page.getByRole('table');
  await expect(table.getByText(INTERNATIONAL, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(table.getByText(LONG_INTERNATIONAL, { exact: true })).toBeVisible();
  await expect(table.getByText(UNREADABLE, { exact: true })).toBeVisible();
  await expect(table.getByText(NATIONAL, { exact: true })).toHaveCount(0);
  // A 390 px la tabla está oculta (display: none) y `getByRole('table')` ya no
  // la encuentra: se apunta al número visible en cada ancho (fila o tarjeta).
  await shot(page, 'phone-international-list', page.getByText(LONG_INTERNATIONAL, { exact: true }).filter({ visible: true }));

  await page.setViewportSize(VIEWPORTS[1]);
  const card = page.getByText(UNREADABLE, { exact: true }).filter({ visible: true });
  await expect(card).toBeVisible();
  await expectInside(card, page.locator('main'));
  await expect(page.getByText(LONG_INTERNATIONAL, { exact: true }).filter({ visible: true })).toBeVisible();
  await page.setViewportSize(VIEWPORTS[0]);
});

test('the record header, «Datos» and the responsibles show the international format', async ({ page }) => {
  await loginAs(page, clinic.origin, clinic.email, password);
  await page.goto(`${clinic.origin}/patients/${patients.national}`);
  const identity = page.getByRole('list', { name: 'Datos de identificación' });
  await expect(identity).toContainText(`Tel. ${INTERNATIONAL}`, { timeout: 15_000 });
  await expect(identity).not.toContainText(NATIONAL);
  await expect(page.getByText(INTERNATIONAL, { exact: true }).first()).toBeVisible();

  const responsibles = page.getByRole('region', { name: 'Responsable y familia' });
  const rows = responsibles.getByTestId('responsible-row');
  await expect(rows.filter({ hasText: 'Luis Ortiz' })).toContainText(CONTACT_INTERNATIONAL);
  await expect(rows.filter({ hasText: 'Luis Ortiz' })).not.toContainText(CONTACT_NATIONAL);
  await expect(rows.filter({ hasText: 'Rosa Ortiz' })).toContainText(UNREADABLE);
  await shot(page, 'phone-international-record', identity);
  await shot(page, 'phone-international-responsibles', rows.filter({ hasText: 'Rosa Ortiz' }));

  await page.setViewportSize(VIEWPORTS[1]);
  await expectInside(rows.filter({ hasText: 'Rosa Ortiz' }).getByText(UNREADABLE), responsibles);
  await page.setViewportSize(VIEWPORTS[0]);
});

test('a long number and an unreadable one fit the header at 390 px', async ({ page }) => {
  await loginAs(page, clinic.origin, clinic.email, password);
  for (const [id, text, name] of [
    [patients.long, LONG_INTERNATIONAL, 'phone-international-header-long'],
    [patients.unreadable, UNREADABLE, 'phone-international-header-unreadable'],
  ] as const) {
    await page.goto(`${clinic.origin}/patients/${id}`);
    const identity = page.getByRole('list', { name: 'Datos de identificación' });
    await expect(identity).toContainText(`Tel. ${text}`, { timeout: 15_000 });
    await shot(page, name, identity);
    await page.setViewportSize(VIEWPORTS[1]);
    await expectInside(identity.getByText(`Tel. ${text}`), page.locator('main'));
    await page.setViewportSize(VIEWPORTS[0]);
  }
});

test('the location phone shows the international format of its own prefix', async ({ page }) => {
  await loginAs(page, clinic.origin, clinic.email, password);
  await page.goto(`${clinic.origin}/settings/sedes`);
  // B6: el teléfono se lee en la ficha de la sede y se cambia en «Editar sede».
  await page.getByRole('link', { name: /^Abrir / }).first().click();
  const section = page.getByRole('region', { name: 'Datos de la sede' });
  const value = section.getByText('+58 212 5551234', { exact: true });
  await expect(value).toBeVisible({ timeout: 15_000 });
  await shot(page, 'phone-international-location', value);
});
