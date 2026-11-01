import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { tenantOrigin } from './support/urls';

/**
 * e2e (DX-019): Ajustes › Datos de la clínica.
 *
 *  1. Clínica nueva: el inicio y el recibo dicen «Datos fiscales pendientes».
 *  2. El ADMIN escribe los datos fiscales (identificador libre con nombre
 *     propio) y elige color y logo: el acento y el logo cambian AL INSTANTE,
 *     sin recargar, y el login de su subdominio los enseña.
 *  3. El recibo nuevo imprime el identificador con su nombre; el anterior no
 *     cambia. Presupuesto y estado de cuenta imprimen los datos.
 *  4. Un logo inválido se rechaza con un mensaje claro; un color sin contraste
 *     o cerca de un estado se advierte.
 *  5. Recepción: estado bloqueado y sin entrada en el índice.
 *  6. Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `clinica-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Ajustes', email: `admin.clinica.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `recep.clinica.${suffix}@example.com` };
const QA_DIR = process.env.E2E_QA_DIR;
const SEDE = { country: 'VE', currency: 'USD', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' } as const;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
const BRAND = '#6D28D9';

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG real de 64×24 (no se puede mockear: la API lo valida por sus bytes). */
function png(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(24, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(64 * 3, 0x55)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 24 }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let session: ApiSession;
let receptionSession: ApiSession;
let patientId = '';
let planId = '';
const payments = { before: '', after: '' };

async function pay(request: APIRequestContext, amount: number): Promise<string> {
  return (
    await apiPost<{ id: string }>(request, receptionSession, `/treatment-plans/${planId}/payments`, {
      amount,
      currency: 'USD',
      paidAt: new Date().toISOString(),
      method: 'CASH',
    })
  ).id;
}

async function shoot(page: Page, name: string, width: number, focus?: Locator): Promise<void> {
  if (!QA_DIR) return;
  if (focus) {
    await expect(focus.first()).toBeVisible({ timeout: 15_000 });
    await focus.first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }
  mkdirSync(QA_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function bothSizes(page: Page, name: string, focus?: Locator): Promise<void> {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, name, viewport.width, focus);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const accent = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().toUpperCase());

async function openReceipt(page: Page, paymentId: string): Promise<Locator> {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`${origin}/print/payments/${paymentId}/receipt`);
  const doc = page.getByTestId('receipt-document');
  await expect(doc).toBeVisible({ timeout: 15_000 });
  return doc;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Marca ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: SEDE,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  receptionSession = await apiLogin(request, origin, reception.email, password);
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Lucía',
      lastName: `Marca${suffix}`.slice(0, 40),
      docType: 'PASSPORT',
      docNumber: `MAR${suffix}`.slice(0, 20),
      sex: 'F',
    })
  ).id;
  planId = (await apiPost<{ id: string }>(request, session, `/patients/${patientId}/treatment-plans`, { currency: 'USD' })).id;
  payments.before = await pay(request, 100);
});

test('sin datos fiscales: el inicio lo dice, enlaza a Ajustes y el recibo sale con el aviso', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/dashboard`);
  const notice = page.getByTestId('clinic-fiscal-notice');
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await bothSizes(page, 'inicio-pendiente', notice);
  await notice.getByRole('link', { name: 'Completar datos' }).click();
  await expect(page).toHaveURL(/\/settings\/clinica$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Datos de la clínica' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('fiscal-pending-callout')).toBeVisible();
  await bothSizes(page, 'ajustes-vacio', page.getByRole('textbox', { name: 'Nombre comercial' }));
  const doc = await openReceipt(page, payments.before);
  await expect(doc).toContainText('Datos fiscales pendientes');
});

test('un logo inválido se rechaza; un color sin contraste o cerca de un estado se advierte', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/clinica`);
  await expect(page.getByRole('textbox', { name: 'Nombre comercial' })).toBeVisible({ timeout: 15_000 });
  const input = page.getByTestId('clinic-logo-input');
  await input.setInputFiles({ name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(page.getByText('El logo debe ser una imagen PNG, JPG o SVG.')).toBeVisible();
  // Con extensión .png pero sin ser un PNG: lo rechaza la API, por sus bytes.
  await input.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('<html>hola</html>') });
  await page.getByRole('button', { name: 'Guardar los datos de la clínica' }).click();
  await expect(page.getByRole('region', { name: 'Cambios sin guardar' }).getByRole('alert')).toContainText(
    'El logo debe ser una imagen PNG, JPG o SVG.',
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Descartar' }).click();

  const hex = page.getByRole('textbox', { name: 'Color en hexadecimal' });
  await hex.fill('#3B82F6');
  await expect(page.getByTestId('accent-contrast-warning')).toContainText('tono más oscuro');
  await hex.fill('#7DD3FC');
  await expect(page.getByTestId('accent-contrast-warning')).toContainText('en oscuro');
  await hex.fill('#B91C1C');
  await expect(page.getByTestId('accent-status-warning')).toContainText('peligro');
  await bothSizes(page, 'ajustes-avisos', page.getByTestId('accent-preview'));
  await page.getByRole('button', { name: 'Descartar' }).click();
});

test('el ADMIN guarda: color y logo al instante en la app y en el login; el recibo imprime su identificador', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/clinica`);
  const name = page.getByRole('textbox', { name: 'Nombre comercial' });
  await expect(name).toBeVisible({ timeout: 15_000 });
  await name.fill('Clínica Violeta');
  await page.getByRole('textbox', { name: 'Razón social' }).fill('Violeta Odontología S.A.');
  await page.getByRole('textbox', { name: 'Nombre del identificador fiscal' }).fill('ID fiscal');
  await page.getByRole('textbox', { name: 'Identificador fiscal', exact: true }).fill('A/2026 #00-77ß');
  await page.getByRole('textbox', { name: 'Dirección fiscal' }).fill('Av. Principal 1, Torre Norte');
  await page.getByRole('textbox', { name: 'Email de contacto' }).fill('hola@violeta.example');
  await page.getByRole('textbox', { name: 'Teléfono de contacto' }).fill('+1 555 0100');
  await page.getByRole('textbox', { name: 'Color en hexadecimal' }).fill(BRAND);
  await page.getByTestId('clinic-logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png() });
  const preview = page.getByTestId('document-header-preview');
  await expect(preview).toContainText('Violeta Odontología S.A. · ID fiscal A/2026 #00-77ß');
  await expect(preview.locator('img')).toHaveAttribute('src', /^data:image\/png/);
  await bothSizes(page, 'ajustes-con-cambios', page.getByRole('region', { name: 'Cambios sin guardar' }));

  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
  await page.getByRole('button', { name: 'Guardar los datos de la clínica' }).click();
  await expect(page.getByRole('region', { name: 'Cambios sin guardar' })).toHaveCount(0, { timeout: 15_000 });
  // Al instante: sin recargar la página.
  await expect.poll(() => accent(page)).toBe(BRAND);
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  const logo = page.getByTestId('clinic-brand').locator('img').first();
  await expect(logo).toHaveAttribute('src', /\/files\/logos\/.+\.png$/);
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId('fiscal-pending-callout')).toHaveCount(0);
  await bothSizes(page, 'ajustes-guardado', page.getByRole('textbox', { name: 'Nombre comercial' }));

  // Persistido.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Razón social' })).toHaveValue('Violeta Odontología S.A.', { timeout: 15_000 });

  // El login de su subdominio, sin sesión.
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await anon.newPage();
  await login.goto(`${origin}/login`);
  await expect(login.getByRole('heading', { level: 1, name: 'Clínica Violeta' })).toBeVisible({ timeout: 15_000 });
  const loginLogo = login.locator('header img');
  await expect(loginLogo).toHaveAttribute('src', /\/files\/logos\/.+\.png$/);
  await expect.poll(() => loginLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => accent(login)).toBe(BRAND);
  await bothSizes(login, 'login-marca');
  await anon.close();

  // El inicio ya no lo pide.
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('clinic-fiscal-notice')).toHaveCount(0);

  // Recibo nuevo con el identificador y su nombre; el anterior, igual que salió.
  payments.after = await pay(request, 200);
  const after = await openReceipt(page, payments.after);
  await expect(after).toContainText('Violeta Odontología S.A. · ID fiscal A/2026 #00-77ß');
  await expect(after).toContainText('Av. Principal 1, Torre Norte');
  await expect(after).not.toContainText('Datos fiscales pendientes');
  await bothSizes(page, 'recibo-fiscal');
  const before = await openReceipt(page, payments.before);
  await expect(before).toContainText('Datos fiscales pendientes');
  await expect(before).not.toContainText('Violeta Odontología');
});

test('el estado de cuenta imprime los datos fiscales', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`${origin}/print/patients/${patientId}/account-statement`);
  const fiscal = page.getByTestId('clinic-fiscal');
  await expect(fiscal).toContainText('Violeta Odontología S.A. · ID fiscal A/2026 #00-77ß', { timeout: 15_000 });
  await expect(fiscal).toContainText('hola@violeta.example · +1 555 0100');
  await bothSizes(page, 'estado-de-cuenta-fiscal', fiscal);
});

test('recepción: sin entrada en el índice y estado bloqueado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/settings`);
  await expect(page.locator('a[href="/settings/profile"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[href="/settings/clinica"]')).toHaveCount(0);
  await page.goto(`${origin}/settings/clinica`);
  await expect(page.getByText('Solo administración edita los datos de la clínica.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('textbox', { name: 'Nombre comercial' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});
