import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-015-bis · Ajustes › Recall: en una clínica nueva (nace con Higiene,
 * Control y Mantenimiento periodontal), el ADMIN crea un tipo, le pone un
 * procedimiento que lo reinicia y lo hace excluyente con Control, que no tenía
 * grupo: la pantalla crea uno para los dos. La API lo confirma.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `recallset-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.rset.${suffix}@example.com` };
const NEW_TYPE = 'Retención de ortodoncia';

let session: ApiSession;

interface ApiRecallType {
  id: string;
  name: string;
  defaultIntervalMonths: number;
  exclusionGroup: string | null;
  triggerCatalogItemIds: string[];
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Ajustes Recall ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
});

test('crear un tipo con disparador y excluyente con Control', async ({ page, request }) => {
  test.setTimeout(120_000);
  const catalogRes = await request.get(`${API_URL}/catalog/items?kind=PROCEDURE&activeOnly=true`, {
    headers: session.headers,
  });
  expect(catalogRes.ok(), await catalogRes.text()).toBeTruthy();
  const catalog = (await catalogRes.json()) as { id: string; code: string; labelEs: string }[];
  const trigger = catalog.find((c) => c.code === 'PREV-PROFILAXIS');
  expect(trigger, 'el catálogo semilla trae la profilaxis').toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings`);
  await page.getByRole('main').getByRole('link', { name: /^Recall/ }).click();
  await expect(page).toHaveURL(`${origin}/settings/recall`);
  await expect(page.getByRole('heading', { level: 1, name: 'Recall' })).toBeVisible({ timeout: 15_000 });

  const list = dataList(page, 'Tipos de recall');
  const rows = dataListRows(list);
  const hygiene = rows.filter({ hasText: /^Higiene/ });
  await expect(hygiene).toContainText('Excluyente con Mantenimiento periodontal');
  await expect(hygiene).toContainText('6 meses');
  // Higiene es del sistema: se desactiva, no se retira.
  await hygiene.getByRole('button', { name: 'Acciones de Higiene' }).click();
  await expect(page.getByRole('menuitem', { name: 'Desactivar' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Retirar' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Nuevo tipo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo tipo de recall' });
  await dialog.getByLabel('Nombre').fill(NEW_TYPE);
  await dialog.getByLabel('Intervalo por defecto (meses)').fill('4');
  await dialog.getByLabel('Excluyente con').selectOption({ label: 'Control' });
  await expect(dialog).toContainText('no cambia los recalls de hoy');
  const search = dialog.getByRole('searchbox', { name: 'Buscar procedimiento' });
  if (await search.count()) await search.fill(trigger!.code);
  await dialog.getByRole('checkbox', { name: trigger!.labelEs, exact: true }).check();
  await expect(dialog).toContainText('1 elegido');
  await expectDialogInsideViewport(page, dialog);
  await shot(page, 'recall-settings-new', 1440);
  await dialog.getByRole('button', { name: 'Crear tipo' }).click();
  await expect(dialog).toBeHidden();

  const created = rows.filter({ hasText: new RegExp(`^${NEW_TYPE}`) });
  await expect(created).toContainText('Excluyente con Control');
  await expect(created).toContainText('4 meses');
  await expect(created).toContainText(trigger!.labelEs);
  await expect(rows.filter({ hasText: /^Control/ })).toContainText(`Excluyente con ${NEW_TYPE}`);
  await expectNoHorizontalScroll(page);
  await shot(page, 'recall-settings-list', 1440);

  // La API: los dos con el mismo grupo nuevo y el disparador guardado.
  const typesRes = await request.get(`${API_URL}/recall-types`, { headers: session.headers });
  expect(typesRes.ok(), await typesRes.text()).toBeTruthy();
  const types = (await typesRes.json()) as ApiRecallType[];
  const mine = types.find((t) => t.name === NEW_TYPE);
  const control = types.find((t) => t.name === 'Control');
  expect(mine).toMatchObject({ defaultIntervalMonths: 4, triggerCatalogItemIds: [trigger!.id] });
  expect(mine!.exclusionGroup).toMatch(/^[A-Z0-9_]{1,40}$/);
  expect(control!.exclusionGroup).toBe(mine!.exclusionGroup);
  expect(types.find((t) => t.name === 'Higiene')!.exclusionGroup).toBe('HYGIENE_PERIO');

  // Al editar, el intervalo avisa de que no mueve los recalls que ya hay.
  await rowAction(page, created, 'Editar');
  const edit = page.getByRole('dialog', { name: 'Editar tipo de recall' });
  await expect(edit).toContainText('Solo se aplica a los recalls que se creen a partir de ahora.');
  await expect(edit.getByLabel('Excluyente con')).toHaveValue(control!.id);
  await edit.getByRole('button', { name: 'Cancelar' }).click();
  await expect(edit).toBeHidden();

  // A 390 px la lista no desborda.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rows.filter({ hasText: NEW_TYPE })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'recall-settings-list', 390);
});
