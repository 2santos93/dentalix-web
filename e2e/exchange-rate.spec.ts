import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';

/**
 * e2e (DX-374): Ajustes › Tasa de cambio. Una clínica nueva por corrida.
 *
 *  1. Una clínica nueva está en «Automática», sin tasas manuales (estado
 *     vacío), y la entrada sale en el índice de Ajustes del ADMIN.
 *  2. El ADMIN pasa a «Manual» en un modal (rige desde hoy: «Manual desde
 *     el …») y registra la tasa de hoy de una moneda (coma decimal, sin la
 *     moneda base en el selector): sale en la lista y la lectura de tasas del
 *     día (API) la devuelve con la fuente MANUAL.
 *  3. Registrar otra vez la misma moneda el mismo día: el modal dice el 409 en
 *     español y no cierra.
 *  4. RECEPCIÓN no ve la entrada y por URL ve el aviso de permisos.
 *  5. 390 px sin desplazamiento lateral y el modal dentro de la pantalla; axe
 *     en claro y oscuro.
 *
 * Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR si está definido.
 */
const rawSuffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const CURRENCY = 'EUR';

let origin: string;
let admin: ApiSession;
let adminEmail: string;
let receptionEmail: string;

/** Hoy en la zona de la sede de e2e (la misma regla que la pantalla). */
function sedeToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: E2E_REGION.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function shoot(page: Page, name: string, target?: Locator): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await target?.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.mouse.move(0, 0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png`, fullPage: false });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

async function openPage(page: Page, email: string): Promise<void> {
  await loginAs(page, origin, email, password);
  await page.goto(`${origin}/settings/tasa-de-cambio`);
  await expect(page.getByRole('heading', { level: 1, name: 'Tasa de cambio' })).toBeVisible();
}

/** Abre «Registrar tasa», elige la moneda y escribe la tasa; devuelve el modal. */
async function fillRate(page: Page, rate: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Registrar tasa' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Registrar tasa' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Fecha')).toHaveValue(sedeToday());
  await expect(dialog.getByLabel('Fecha')).toHaveAttribute('max', sedeToday());
  const currency = dialog.getByLabel('Moneda');
  await expect(currency.locator(`option[value="${CURRENCY}"]`)).toHaveCount(1, { timeout: 15_000 });
  // La moneda base de las tasas (la da la API) no se ofrece.
  await expect(currency.locator('option[value="USD"]')).toHaveCount(0);
  await currency.selectOption(CURRENCY);
  await dialog.getByLabel('Tasa por 1 USD').fill(rate);
  return dialog;
}

test.beforeAll(async ({ playwright }) => {
  const suffix = `${rawSuffix.slice(0, 10)}${randomUUID().slice(0, 6)}`;
  adminEmail = `admin.tasa.${suffix}@example.com`;
  receptionEmail = `recepcion.tasa.${suffix}@example.com`;
  const request = await playwright.request.newContext();
  try {
    admin = await registerClinicViaApi(request, {
      subdomain: `tasa-${suffix}`,
      clinicName: `Clinica Tasa ${suffix}`,
      fullName: 'Dra Tasa',
      email: adminEmail,
      password,
    });
    origin = admin.origin;
    await addStaffViaApi(request, admin, {
      fullName: 'Recepción Tasa',
      email: receptionEmail,
      role: 'RECEPTION',
      password,
    });
  } finally {
    await request.dispose();
  }
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
});

test('the ADMIN sees the entry and a new clinic starts automatic with no manual rates', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/settings`);
  await page.getByRole('link', { name: /Tasa de cambio/ }).click();
  await expect(page).toHaveURL(/\/settings\/tasa-de-cambio$/);
  await expect(page.getByTestId('exchange-rate-source')).toHaveText('Automática');
  await expect(page.getByText('Aún no hay tasas manuales')).toBeVisible();
  await shoot(page, 'dx374-vacio');
});

test('the ADMIN switches to manual, registers today’s rate and the day’s rates read it', async ({ page, request }) => {
  await openPage(page, adminEmail);
  await page.getByRole('button', { name: 'Cambiar' }).click();
  const sourceDialog = page.getByRole('dialog', { name: 'Cambiar de dónde sale la tasa' });
  await sourceDialog.getByRole('radio', { name: /Manual/ }).check();
  await shoot(page, 'dx374-modal-fuente', sourceDialog);
  await sourceDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(sourceDialog).toBeHidden();
  // Rige desde hoy: los abonos de días anteriores siguen con la automática.
  await expect(page.getByTestId('exchange-rate-source')).toHaveText(/^Manual desde el \S+$/);

  const rateDialog = await fillRate(page, '0,91');
  await page.setViewportSize(VIEWPORTS[1]);
  await expectDialogInsideViewport(page, rateDialog);
  await page.setViewportSize(VIEWPORTS[0]);
  await shoot(page, 'dx374-modal-tasa', rateDialog);
  await rateDialog.getByRole('button', { name: 'Registrar tasa' }).click();
  await expect(rateDialog).toBeHidden();

  const table = page.getByRole('table', { name: 'Tasas manuales' });
  await expect(table.getByRole('row').filter({ hasText: CURRENCY })).toHaveCount(1);
  await expect(page.getByText(`Tasa de ${CURRENCY} registrada.`)).toBeVisible();
  await shoot(page, 'dx374-lista', table);

  const res = await request.get(`${API_URL}/exchange/rates?date=${sedeToday()}`, { headers: admin.headers });
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ base: 'USD', source: 'MANUAL', rates: { [CURRENCY]: 0.91 } });
});

test('registering the same currency twice the same day keeps the modal open with the Spanish 409', async ({ page }) => {
  await openPage(page, adminEmail);
  const dialog = await fillRate(page, '0,95');
  await dialog.getByRole('button', { name: 'Registrar tasa' }).click();
  await expect(
    dialog.getByText('Ya hay una tasa registrada para esa moneda en ese día. Si ningún abono la usó, corrígela en la lista.'),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('reception does not see the entry and gets the permission notice by URL', async ({ page }) => {
  await loginAs(page, origin, receptionEmail, password);
  await page.goto(`${origin}/settings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Tasa de cambio/ })).toHaveCount(0);
  await page.goto(`${origin}/settings/tasa-de-cambio`);
  await expect(page.getByText('Solo administración ve y cambia la tasa de cambio.')).toBeVisible();
});

test('the screen fits 390 px and has no axe violations in light and dark', async ({ page }) => {
  await openPage(page, adminEmail);
  await expect(page.getByRole('table', { name: 'Tasas manuales' })).toBeVisible();
  await page.setViewportSize(VIEWPORTS[1]);
  await expectNoHorizontalScroll(page);
  const violations = await axeInBothThemes(page, page.locator('main'));
  expect(violations.light, 'axe en claro').toEqual([]);
  expect(violations.dark, 'axe en oscuro').toEqual([]);
});
