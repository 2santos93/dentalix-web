import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalOverflowInDialog, expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-205): «Actualizar precios» del catálogo en bloque.
 *
 * Una clínica nueva (moneda de la suite, USD) con su catálogo semilla. Se da
 * precio a los procedimientos de la categoría «Prevención» (la categoría
 * preventiva del catálogo por defecto) y el ADMIN:
 *  1. abre el asistente, filtra «Prevención», sube un 5 % redondeando a 1;
 *  2. ve la vista previa (tarjetas sin scroll horizontal a 390 px; tabla a
 *     1440), continúa y aplica;
 *  3. los precios del catálogo son los de la vista previa y el historial del
 *     ítem muestra el cambio con su autor.
 * Un odontólogo no ve el botón y la API le responde 403.
 * Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `precios-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Precios', email: `admin.precios.${suffix}@example.com` };
const dentist = { fullName: 'Dino Dentista', email: `dent.precios.${suffix}@example.com` };
const QA_DIR = process.env.E2E_QA_DIR;
const CATEGORY = 'Prevención';

interface CatalogItem {
  id: string;
  code: string;
  labelEs: string;
  category: string | null;
  kind: 'PROCEDURE' | 'DIAGNOSIS';
  active: boolean;
  defaultPrice: number | null;
}

let session: ApiSession;
/** Ítem de «Prevención» → precio que se le da antes (y el que debe quedar). */
const expected = new Map<string, { item: CatalogItem; before: number; after: number }>();

async function shoot(page: Page, name: string, width: number, focus?: Locator): Promise<void> {
  if (!QA_DIR) return;
  if (focus) await expect(focus.first()).toBeVisible({ timeout: 15_000 });
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

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  expect(E2E_REGION.currency).toBe('USD');
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Precios ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const res = await request.get(`${API_URL}/catalog/items`, { headers: session.headers });
  expect(res.ok()).toBeTruthy();
  const items = ((await res.json()) as CatalogItem[]).filter((i) => i.category === CATEGORY && i.active);
  expect(items.length).toBeGreaterThan(0);
  // Precios en USD con céntimos: 35,00 · 45,00 · 55,00 …  +5 % a 1 → 37 · 47 · 58 …
  for (const [i, item] of items.entries()) {
    const before = 35 + i * 10;
    const patched = await request.patch(`${API_URL}/catalog/items/${item.id}`, {
      headers: session.headers,
      data: { defaultPrice: before },
    });
    expect(patched.ok(), await patched.text()).toBeTruthy();
    expected.set(item.id, { item, before, after: Math.round(before * 1.05) });
  }
});

test('el odontólogo no ve «Actualizar precios» y la API le responde 403', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/catalog`);
  await expect(page.getByRole('table', { name: 'Catálogo dental' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Actualizar precios' })).toHaveCount(0);
  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': new URL(origin).host },
    data: { email: dentist.email, password },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const preview = await request.post(`${API_URL}/catalog/price-changes/preview`, {
    headers: { ...session.headers, Authorization: `Bearer ${accessToken}` },
    data: { mode: 'PERCENT', value: 5 },
  });
  expect(preview.status()).toBe(403);
});

test('el ADMIN sube un 5 % la categoría «Prevención» con vista previa y la aplica', async ({ page, request }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/catalog`);
  await page.getByRole('button', { name: 'Actualizar precios' }).click();
  const dialog = page.getByRole('dialog', { name: 'Actualizar precios' });
  await expect(dialog.getByLabel('Categoría')).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel('Categoría').selectOption(CATEGORY);
  await dialog.getByLabel('Porcentaje (%)').fill('5');
  await dialog.getByLabel('Redondeo').selectOption('1');
  await expectNoHorizontalScroll(page);
  await shoot(page, 'precios-filtros', 390, dialog);
  await dialog.getByRole('button', { name: 'Ver vista previa' }).click();

  // 390 px: la vista previa en tarjetas, sin scroll horizontal.
  const list = dialog.getByRole('list', { name: 'Precios que cambian' });
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list.getByRole('listitem')).toHaveCount(expected.size);
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalOverflowInDialog(dialog);
  await expectNoHorizontalScroll(page);
  await shoot(page, 'precios-vista-previa', 390, list);

  // 1440 px: la misma vista previa en tabla.
  await page.setViewportSize({ width: 1440, height: 900 });
  const table = dialog.getByRole('table', { name: 'Precios que cambian' });
  await expect(table).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Totales' })).toBeVisible();
  await shoot(page, 'precios-vista-previa', 1440, table);

  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByText(/Los ítems que se agreguen desde ahora/)).toBeVisible();
  await shoot(page, 'precios-confirmar', 1440, dialog);
  const apply = dialog.getByRole('button', { name: /^Aplicar \d+ precios?$/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/precios? actualizados?/)).toBeVisible();

  // Los precios del catálogo son los de la vista previa.
  const res = await request.get(`${API_URL}/catalog/items`, { headers: session.headers });
  const after = new Map(((await res.json()) as CatalogItem[]).map((i) => [i.id, i.defaultPrice]));
  for (const [id, { after: price }] of expected) expect(after.get(id)).toBe(price);

  // El historial del ítem muestra el cambio con su autor.
  const first = [...expected.values()][0];
  for (const width of [390, 1440] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${origin}/catalog`);
    const search = page.getByRole('searchbox').or(page.getByPlaceholder('Buscar…')).first();
    await search.fill(first.item.code);
    await page.getByRole('button', { name: `Acciones de ${first.item.labelEs}` }).click();
    await page.getByRole('menuitem', { name: 'Historial de precios' }).click();
    const history = page.getByRole('dialog', { name: `Historial de precios · ${first.item.labelEs}` });
    await expect(history.getByText(admin.fullName, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(history.getByText('Actualización en bloque')).toBeVisible();
    if (width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, 'precios-historial', width, history);
    await page.keyboard.press('Escape');
  }
});
