import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { tenantOrigin } from './support/urls';

/**
 * e2e (DX-517): el texto propio de cada moneda de la clínica.
 *
 * Una clínica nueva por corrida con una sede en VES y formato es-VE (datos de
 * la prueba, no del producto):
 *  1. Sin configurar, Ajustes › Monedas enseña la fila de VES vacía y el
 *     ejemplo con el código; el recibo pinta el código.
 *  2. El ADMIN escribe «Bs.»: la vista previa dice «Bs. 1.234,50» (posición de
 *     es-VE); al guardar, la caja y el recibo NUEVO usan «Bs.»; el recibo
 *     ANTERIOR se reimprime con el código (foto congelada).
 *  3. Recepción no puede cambiarlo (estado bloqueado) y el índice de Ajustes
 *     (DX-515-bis) describe Caja con el recibo.
 *  4. Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR; sin scroll
 *     horizontal a 390.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `moneda-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Ajustes', email: `admin.moneda.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `recep.moneda.${suffix}@example.com` };
const QA_DIR = process.env.E2E_QA_DIR;
const SEDE = { country: 'VE', currency: 'VES', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' } as const;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

let session: ApiSession;
let receptionSession: ApiSession;
let planId = '';
const payments = { before: '', after: '' };

async function pay(request: APIRequestContext, amount: number): Promise<string> {
  return (
    await apiPost<{ id: string }>(request, receptionSession, `/treatment-plans/${planId}/payments`, {
      amount,
      currency: 'VES',
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

async function openPrint(page: Page, paymentId: string): Promise<Locator> {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`${origin}/print/payments/${paymentId}/receipt`);
  const doc = page.getByTestId('receipt-document');
  await expect(doc).toBeVisible({ timeout: 15_000 });
  return doc;
}

const flat = (text: string | null) => (text ?? '').replace(/\s+/g, ' ');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Moneda ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: SEDE,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  receptionSession = await apiLogin(request, origin, reception.email, password);
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Lucía',
    lastName: `Moneda${suffix}`.slice(0, 40),
    docType: 'PASSPORT',
    docNumber: `MON${suffix}`.slice(0, 20),
    sex: 'F',
  });
  planId = (
    await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, { currency: 'VES' })
  ).id;
  payments.before = await pay(request, 1234.5);
});

test('sin configurar: la fila de VES vacía, el ejemplo con el código y el recibo con el código', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/monedas`);
  const ves = page.getByRole('textbox', { name: 'Texto de VES' });
  await expect(ves).toBeVisible({ timeout: 15_000 });
  await expect(ves).toHaveValue('');
  await expect(page.getByText('Así se verá: VES 1.234,50')).toBeVisible();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'monedas-empty', viewport.width, ves);
  }
  const doc = await openPrint(page, payments.before);
  expect(flat(await doc.textContent())).toContain('1234,50 VES');
});

test('el ADMIN escribe «Bs.»: la caja y el recibo nuevo lo usan; el anterior se reimprime igual', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/monedas`);
  const ves = page.getByRole('textbox', { name: 'Texto de VES' });
  await expect(ves).toBeVisible({ timeout: 15_000 });
  await ves.fill('Bs.');
  await expect(page.getByText('Así se verá: Bs. 1.234,50')).toBeVisible();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'monedas-dirty', viewport.width, page.getByRole('region', { name: 'Cambios sin guardar' }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Guardar el texto de las monedas' }).click();
  await expect(page.getByRole('region', { name: 'Cambios sin guardar' })).toHaveCount(0, { timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Texto de VES' })).toHaveValue('Bs.', { timeout: 15_000 });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'monedas-saved', viewport.width, page.getByRole('textbox', { name: 'Texto de VES' }));
  }

  payments.after = await pay(request, 2000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // La caja (pantalla) pinta con el texto de la clínica.
  await page.goto(`${origin}/caja`);
  const main = page.locator('main');
  await expect(main.getByText(/Bs\./).first()).toBeVisible({ timeout: 15_000 });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'caja-bs', viewport.width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // El recibo nuevo congela «Bs.»; el anterior se reimprime con el código.
  const after = await openPrint(page, payments.after);
  expect(flat(await after.textContent())).toContain('2000,00 Bs.');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'receipt-bs', viewport.width);
  }
  const before = await openPrint(page, payments.before);
  const beforeText = flat(await before.textContent());
  expect(beforeText).toContain('1234,50 VES');
  expect(beforeText).not.toContain('Bs.');
});

test('recepción no lo cambia: estado bloqueado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/settings/monedas`);
  await expect(page.getByText('Solo administración cambia cómo se escribe cada moneda.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('textbox', { name: 'Texto de VES' })).toHaveCount(0);
});

test('el índice de Ajustes enseña Monedas y describe Caja con el recibo (DX-515-bis)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings`);
  await expect(page.locator('a[href="/settings/caja"]')).toHaveAccessibleDescription(
    'Cómo se abre y se cierra la caja por turno, con qué medios se cobra y qué dice el recibo.',
    { timeout: 15_000 },
  );
  await expect(page.locator('a[href="/settings/monedas"]')).toHaveAccessibleName('Monedas');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'settings-index', viewport.width, page.locator('a[href="/settings/monedas"]'));
  }
});
