import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from './support/test';
import { apiLogin, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-543: «Mantenimientos de equipos» en «Mi día» (Inicio) contra la
 * clínica DEMO sembrada (`npm run seed:demo`), que trae la unidad del Sillón 1
 * de la Sede Norte VENCIDA y los rayos X periapical de la principal que VENCEN
 * PRONTO (DX-542). El ADMIN los ve con «Todas las sedes», de lo más urgente a
 * lo menos, con su estado en texto y el enlace a la hoja de vida; el bloque
 * sigue al selector global de sede; recepción no lo ve (equipos: solo ADMIN).
 * Solo lee: no deja nada en la demo (DX-337).
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const BLOCK = 'Mantenimientos de equipos';
const OVERDUE = 'Unidad dental Sillón 1';
const DUE_SOON = 'Rayos X periapical';
let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await apiLogin(request, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
});

/** Errores de la consola del navegador (los de red de un 4xx esperado no cuentan). */
function watchConsole(page: Page, errors: string[] = []): string[] {
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Capturas en claro (`E2E_QA_DIR`): la pantalla y el bloque solo. */
async function qaShots(page: Page, width: number): Promise<void> {
  const qaDir = process.env.E2E_QA_DIR;
  if (!qaDir) return;
  mkdirSync(qaDir, { recursive: true });
  await page.mouse.move(0, 0);
  await page.emulateMedia({ colorScheme: 'light' });
  const block = page.getByRole('region', { name: BLOCK });
  await block.scrollIntoViewIfNeeded();
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.screenshot({ path: `${qaDir}/dx543-mi-dia-${width}-light.png`, fullPage: false });
  await block.screenshot({ path: `${qaDir}/dx543-bloque-${width}-light.png` });
}

test('la API da el vencido y el por vencer de la demo, y 403 a recepción', async ({ request }) => {
  const res = await request.get(`${API_URL}/equipment/maintenance-due`, { headers: session.headers });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { items: { name: string; maintenanceStatus: string }[] };
  const status = Object.fromEntries(body.items.map((i) => [i.name, i.maintenanceStatus]));
  expect(status[OVERDUE]).toBe('OVERDUE');
  expect(status[DUE_SOON]).toBe('DUE_SOON');
  // Al día y sin programar no avisan.
  expect(status['Autoclave clase B']).toBeUndefined();
  expect(status['Compresor odontológico']).toBeUndefined();

  const reception = await apiLogin(request, origin, 'recepcion@demo.dentalix.app', DEMO_PASSWORD);
  const denied = await request.get(`${API_URL}/equipment/maintenance-due`, { headers: reception.headers });
  expect(denied.status()).toBe(403);
});

for (const width of [1440, 390] as const) {
  test(`ADMIN ve «${BLOCK}» en Mi día y abre la hoja de vida (${width}px)`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
    // «Todas las sedes» en el selector global: la principal y la Norte juntas.
    await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
    await page.goto(`${origin}/dashboard`);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('dashboard-scope')).toContainText('Todas las sedes');

    const block = page.getByRole('region', { name: BLOCK });
    await expect(block.getByRole('heading', { level: 2, name: BLOCK })).toBeVisible({ timeout: 15_000 });
    const rows = block.getByTestId('inicio-equipment-row');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    // Lo más urgente primero: el vencido antes que el que vence pronto.
    await expect(rows.nth(0)).toContainText(OVERDUE);
    await expect(rows.nth(0)).toContainText('Sede Norte · Sillón 1');
    await expect(rows.nth(0)).toContainText('Vencido');
    await expect(rows.nth(0)).toContainText(/Venció (ayer|hace \d+ días)/);
    await expect(rows.nth(1)).toContainText(DUE_SOON);
    await expect(rows.nth(1)).toContainText('Vence pronto');
    await expect(rows.nth(1)).toContainText(/Vence (hoy|mañana|en \d+ días)/);
    await expect(block.getByRole('link', { name: 'Ver equipos' })).toHaveAttribute('href', '/settings/equipos');
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page);
    await qaShots(page, width);

    await block.getByRole('link', { name: `${OVERDUE} (hoja de vida)` }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hoja de vida del equipo' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: OVERDUE })).toBeVisible();
    await expect(page.getByText('Vencido').first()).toBeVisible();

    expect(errors, 'errores de consola').toEqual([]);
  });
}

test('el bloque sigue al selector global de sede, y recepción no lo ve', async ({ page, request }) => {
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  expect(locations.ok()).toBeTruthy();
  const norte = ((await locations.json()) as { id: string; name: string }[]).find((l) => l.name === 'Sede Norte');
  expect(norte).toBeDefined();

  await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
  await page.evaluate((id) => window.localStorage.setItem('dentalix.activeLocationId', id), norte!.id);
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByTestId('dashboard-scope')).toContainText('Sede Norte', { timeout: 15_000 });
  const block = page.getByRole('region', { name: BLOCK });
  await expect(block.getByText(OVERDUE)).toBeVisible({ timeout: 15_000 });
  await expect(block.getByText(DUE_SOON)).toHaveCount(0);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));

  await page.context().clearCookies();
  await loginAs(page, origin, 'recepcion@demo.dentalix.app', DEMO_PASSWORD);
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'Pendientes' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: BLOCK })).toHaveCount(0);
});
