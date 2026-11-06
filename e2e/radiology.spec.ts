import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { apiLogin, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeDayFromToday } from './support/clock';
import { fillDate } from './support/dates';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { shot } from './support/qa-shot';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-544 (porción 1): expediente de rayos X por sede. Contra la clínica
 * DEMO sembrada (`npm run seed:demo`), que trae una licencia del periapical
 * que vence pronto y un control de calidad de la Sede Norte VENCIDO. El ADMIN
 * registra una licencia en Ajustes › Rayos X sin vencimiento (lo calcula la
 * API: Cat. I, 5 años) que vence en unos 30 días, la ve en la lista y en
 * «Licencias y controles de rayos X» de Inicio, a 1440 y 390 px, sin scroll
 * horizontal ni errores de consola. Lo que crea lo anula al terminar: la demo
 * es estado compartido (DX-337) y un documento no se borra.
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').slice(-8);
const SCREEN = 'Rayos X: licencias y control de calidad';
const BLOCK = 'Licencias y controles de rayos X';
const created: string[] = [];
let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await apiLogin(request, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
});

test.afterAll(async ({ request }) => {
  for (const id of created) {
    const res = await request.post(`${API_URL}/radiology-records/${id}/void`, {
      headers: session.headers,
      data: { reason: 'Documento de prueba e2e (DX-544)' },
    });
    expect([200, 409]).toContain(res.status());
  }
});

/** Errores de la consola del navegador (los de red de un 4xx esperado no cuentan). */
function watchConsole(page: Page, errors: string[] = []): string[] {
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Hace 5 años menos 30 días: con 5 años de vigencia, vence en unos 30 días. */
function issuedForDueSoon(): string {
  const [y, m, d] = sedeDayFromToday(30).split('-');
  // El 29/2 no existe cinco años antes: se usa el 28.
  return `${Number(y) - 5}-${m}-${m === '02' && d === '29' ? '28' : d}`;
}

for (const width of [1440, 390] as const) {
  test(`ADMIN registra una licencia y la ve vencer pronto en la lista y en Inicio (${width}px)`, async ({ page, request }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
    // «Todas las sedes» en el selector global: la lista consolida la clínica.
    await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
    await page.goto(`${origin}/settings/rayos-x`);
    await expect(page.getByRole('heading', { level: 1, name: SCREEN })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('settings-scope')).toContainText('Todas las sedes');
    // La demo: el control de calidad de la Norte, vencido.
    await expect(page.getByText('DEMO-QC-0917').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Vencido').filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, 'DX-544-listado', width);

    const reference = `E2E-${width}-${suffix}`;
    await page.getByRole('button', { name: 'Nuevo documento' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo documento de rayos X' });
    await expectDialogInsideViewport(page, dialog);
    await dialog.getByLabel('Sede', { exact: true }).selectOption({ label: 'Sede Norte' });
    await expect(dialog.getByLabel('Equipo de rayos X (opcional)')).toBeEnabled();
    // Sin elegir nada: el primer error recibe el foco.
    await dialog.getByRole('button', { name: 'Registrar documento' }).click();
    await expect(dialog.getByText('Elige la categoría de la licencia.')).toBeVisible();
    await expect(dialog.getByLabel('Categoría de la licencia')).toBeFocused();
    await dialog.getByLabel('Categoría de la licencia').selectOption('I');
    await dialog.getByLabel('Número o resolución').fill(reference);
    await dialog.getByLabel('Autoridad que la expidió').fill('Autoridad sanitaria e2e');
    await fillDate(dialog, 'Fecha de expedición', issuedForDueSoon());
    await expect(dialog.getByText(/Si la dejas vacía, vence el /)).toBeVisible();
    await shot(page, 'DX-544-nueva-licencia', width);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/radiology-records') && r.request().method() === 'POST'),
      dialog.getByRole('button', { name: 'Registrar documento' }).click(),
    ]);
    expect(response.status()).toBe(201);
    const saved = (await response.json()) as { id: string; status: string; expiresOn: string };
    created.push(saved.id);
    expect(saved.status).toBe('DUE_SOON');
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    const row = page.getByText(reference).filter({ visible: true }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page);

    // La API lo trae entre los avisos, con «Vence en N días».
    const due = await request.get(`${API_URL}/radiology-records/due?limit=50`, { headers: session.headers });
    expect(due.ok()).toBeTruthy();
    const items = ((await due.json()) as { items: { id: string; status: string }[] }).items;
    expect(items.find((i) => i.id === saved.id)?.status).toBe('DUE_SOON');

    await page.goto(`${origin}/dashboard`);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible({ timeout: 15_000 });
    const block = page.getByRole('region', { name: BLOCK });
    await expect(block.getByRole('heading', { level: 2, name: BLOCK })).toBeVisible({ timeout: 15_000 });
    const rows = block.getByTestId('inicio-radiology-row');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    // Lo más urgente primero: el control de calidad vencido de la demo.
    await expect(rows.nth(0)).toContainText('Control de calidad DEMO-QC-0917');
    await expect(rows.nth(0)).toContainText('Sede Norte');
    await expect(rows.nth(0)).toContainText(/Venció (ayer|hace \d+ días)/);
    await expect(rows.nth(0)).toContainText('Vencido');
    const mine = rows.filter({ hasText: reference });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText('Licencia · Cat. I');
    await expect(mine).toContainText('Sede Norte');
    await expect(mine).toContainText(/Vence en \d+ días/);
    await expect(mine).toContainText('Vence pronto');
    await expect(block.getByRole('link', { name: 'Ver expediente' })).toHaveAttribute('href', '/settings/rayos-x');
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page);
    await block.scrollIntoViewIfNeeded();
    await shot(page, 'DX-544-mi-dia', width);

    await mine.getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: SCREEN })).toBeVisible({ timeout: 15_000 });

    expect(errors, 'errores de consola').toEqual([]);
  });
}

test('el bloque sigue al selector de sede; el odontólogo lo lee sin cambiarlo; recepción no lo ve', async ({ page, request }) => {
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  const principal = ((await locations.json()) as { id: string; name: string }[]).find((l) => l.name === 'Sede principal');
  expect(principal).toBeDefined();

  await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
  await page.evaluate((id) => window.localStorage.setItem('dentalix.activeLocationId', id), principal!.id);
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByTestId('dashboard-scope')).toContainText('Sede principal', { timeout: 15_000 });
  const block = page.getByRole('region', { name: BLOCK });
  await expect(block.getByText(/DEMO-LIC-2021-0042/)).toBeVisible({ timeout: 15_000 });
  await expect(block.getByText(/DEMO-QC-0917/)).toHaveCount(0);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));

  const reception = await apiLogin(request, origin, 'recepcion@demo.dentalix.app', DEMO_PASSWORD);
  const denied = await request.get(`${API_URL}/radiology-records`, { headers: reception.headers });
  expect(denied.status()).toBe(403);
  expect(((await denied.json()) as { message: string }).message).toBe(
    'Solo odontología y administración ven el expediente de rayos X.',
  );

  // El odontólogo lee el expediente en Ajustes, sin alta ni acciones.
  await page.context().clearCookies();
  await loginAs(page, origin, 'dentista@demo.dentalix.app', DEMO_PASSWORD);
  await page.goto(`${origin}/settings/rayos-x`);
  await expect(page.getByRole('heading', { level: 1, name: SCREEN })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('DEMO-QC-0917').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Solo administración registra o cambia el expediente de rayos X.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo documento' })).toHaveCount(0);

  await page.context().clearCookies();
  await loginAs(page, origin, 'recepcion@demo.dentalix.app', DEMO_PASSWORD);
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByRole('region', { name: 'Pendientes' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: BLOCK })).toHaveCount(0);
  await page.goto(`${origin}/settings/rayos-x`);
  await expect(page.getByText('Solo odontología y administración ven el expediente de rayos X.')).toBeVisible({
    timeout: 15_000,
  });
});
