import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { apiLogin, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { shot } from './support/qa-shot';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-542 (porción 1): equipos biomédicos por sede. Contra la clínica DEMO
 * sembrada (`npm run seed:demo`), que trae equipos en los cuatro estados del
 * programa (uno vencido). El ADMIN crea un equipo en Ajustes › Equipos
 * biomédicos, le registra un preventivo (el próximo sale de la periodicidad),
 * abre su hoja de vida y la vista imprimible, a 390 px y a 1440 px, sin scroll
 * horizontal ni errores de consola. Lo que crea lo da de baja al terminar: la
 * demo es estado compartido (DX-337) y un equipo no se borra.
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').slice(-8);
const created: string[] = [];
let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await apiLogin(request, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
});

test.afterAll(async ({ request }) => {
  for (const id of created) {
    const res = await request.post(`${API_URL}/equipment/${id}/retire`, {
      headers: session.headers,
      data: { reason: 'Equipo de prueba e2e (DX-542)' },
    });
    expect([200, 409]).toContain(res.status());
  }
});

/** Errores de la consola del navegador (los de red de un 4xx esperado no cuentan). */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

for (const width of [1440, 390] as const) {
  test(`ADMIN crea un equipo, registra un preventivo y abre e imprime su hoja de vida (${width}px)`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await loginAs(page, origin, DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
    await page.goto(`${origin}/settings/equipos`);
    await expect(page.getByRole('heading', { level: 1, name: 'Equipos biomédicos' })).toBeVisible({ timeout: 15_000 });

    // La demo trae equipos en todas las sedes; uno vencido.
    await page.getByRole('main').getByLabel('Sede', { exact: true }).selectOption({ label: 'Todas las sedes' });
    await expect(page.getByText('Unidad dental Sillón 1')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Vencido').first()).toBeVisible();
    await shot(page, 'DX-542-listado', width);

    const name = `Lámpara e2e ${width} ${suffix}`;
    await page.getByRole('button', { name: 'Nuevo equipo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo equipo' });
    await expectDialogInsideViewport(page, dialog);
    await dialog.getByLabel('Sede', { exact: true }).selectOption({ label: 'Sede Norte' });
    await expect(dialog.getByLabel('Sillón (opcional)')).toBeEnabled();
    await dialog.getByLabel('Sillón (opcional)').selectOption({ label: 'Sillón 2' });
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByLabel('Tipo').selectOption({ label: 'Lámpara de fotocurado' });
    await dialog.getByLabel('Marca').fill('Woodpecker');
    await dialog.getByLabel('Número de serie').fill(`SN-${suffix}`);
    await dialog.getByLabel('Mantenimiento preventivo cada (meses)').fill('6');
    await shot(page, 'DX-542-nuevo-equipo', width);
    await dialog.getByRole('button', { name: 'Crear equipo' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    await page.getByRole('searchbox', { name: /Buscar por nombre/ }).fill(suffix);
    const link = page.getByRole('link', { name }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Sin programar').first()).toBeVisible();
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hoja de vida del equipo' })).toBeVisible();
    const id = page.url().split('/').pop()!;
    created.push(id);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('Todavía no tiene mantenimientos registrados.')).toBeVisible();

    await page.getByRole('button', { name: 'Registrar mantenimiento' }).click();
    const form = page.getByRole('dialog', { name: 'Registrar mantenimiento' });
    await expectDialogInsideViewport(page, form);
    await expect(form.getByText(/se programa para el .+ por la periodicidad del equipo/)).toBeVisible();
    await form.getByLabel('Técnico').fill('Luis Pérez');
    await form.getByLabel('Empresa').fill('Servitec');
    await form.getByLabel('Qué se hizo').fill('Revisión de la intensidad de luz y limpieza de la guía.');
    await form.getByLabel('Costo (opcional)').fill('40');
    await shot(page, 'DX-542-mantenimiento', width);
    await form.getByRole('button', { name: 'Registrar mantenimiento' }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });

    const history = page.getByTestId('life-sheet-maintenance');
    await expect(history).toHaveCount(1);
    await expect(history.first()).toContainText('Preventivo');
    await expect(history.first()).toContainText('Luis Pérez');
    await expect(page.getByText('Al día')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page);
    await shot(page, 'DX-542-hoja-de-vida', width);

    await page.getByRole('link', { name: 'Imprimir hoja de vida' }).click();
    await expect(page.getByRole('toolbar', { name: 'Acciones de la hoja de vida' })).toBeVisible();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimir' })).toBeEnabled();
    await expectNoHorizontalScroll(page);
    await shot(page, 'DX-542-imprimible', width);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('toolbar', { name: 'Acciones de la hoja de vida' })).toBeHidden();
    await page.emulateMedia({ media: 'screen' });

    expect(errors, 'errores de consola').toEqual([]);
  });
}

test('el listado marca el vencido de la demo y un rol no ADMIN no ve los equipos', async ({ page, request }) => {
  const list = await request.get(`${API_URL}/equipment?query=Sillón 1`, { headers: session.headers });
  expect(list.ok()).toBeTruthy();
  const body = (await list.json()) as { items: { name: string; maintenanceStatus: string }[] };
  expect(body.items.find((i) => i.name === 'Unidad dental Sillón 1')?.maintenanceStatus).toBe('OVERDUE');

  const reception = await apiLogin(request, origin, 'recepcion@demo.dentalix.app', DEMO_PASSWORD);
  const denied = await request.post(`${API_URL}/equipment`, {
    headers: reception.headers,
    data: { locationId: created[0] ?? '00000000-0000-4000-8000-000000000000', name: 'X', category: 'OTHER' },
  });
  expect(denied.status()).toBe(403);
  expect(((await denied.json()) as { message: string }).message).toBe(
    'Solo administración gestiona los equipos biomédicos.',
  );

  await loginAs(page, origin, 'recepcion@demo.dentalix.app', DEMO_PASSWORD);
  await page.goto(`${origin}/settings/equipos`);
  await expect(page.getByText('Solo administración gestiona los equipos biomédicos.')).toBeVisible({ timeout: 15_000 });
});
