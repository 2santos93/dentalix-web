import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e SEC-009: Ajustes → Dominios propios. El ADMIN ve la dirección de su
 * clínica, añade un dominio (queda Pendiente con el TXT a publicar, en su
 * diálogo), verificarlo sin TXT lo deja Pendiente, y lo elimina con
 * confirmación; recepción no ve la entrada en Ajustes, la
 * pantalla le dice que es de administración y la API le responde 403; un id
 * que no es UUID es 400; todo cabe en 390 px.
 *
 * Una clínica nueva por corrida (sufijo único). El host es de example.org: el
 * DNS nunca tendrá su TXT, así que no se verifica.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `dominios-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Dominios', email: `ana.dom.${suffix}@example.com` };
const reception = { fullName: 'Rita Dominios', email: `rita.dom.${suffix}@example.com` };
const host = `citas-${suffix}`.slice(0, 40) + '.example.org';

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Dominios ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
});

test('ADMIN entra por Ajustes, añade un dominio (Pendiente con su TXT), lo intenta verificar y lo elimina', async ({
  page,
}) => {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients`);
  await page.getByRole('button', { name: new RegExp(admin.fullName, 'i') }).first().click();
  // DX-282: el menú de cuenta lleva a «Ajustes», que agrupa los ajustes por tema.
  await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(`${origin}/settings`);
  // Desde 1280 px el sub-menú de Ajustes repite el enlace: los dos llevan al mismo sitio.
  await page.getByRole('link', { name: 'Dominios propios' }).first().click();
  await expect(page).toHaveURL(`${origin}/settings/dominios`);
  await expect(page.getByRole('heading', { name: 'Dominios propios' })).toBeVisible();
  await expect(page.getByText('Todavía no hay dominios propios.')).toBeVisible({ timeout: 15_000 });

  // La dirección de Dentalix de la clínica, a la vista y con «Copiar».
  await expect(page.getByRole('region', { name: 'Dirección de tu clínica' })).toContainText(new URL(origin).host);

  await page.getByRole('button', { name: 'Añadir dominio' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dominio').fill(`https://${host}/login`);
  await dialog.getByRole('button', { name: 'Añadir dominio' }).click();

  // Al añadirlo se abre su diálogo con el TXT a publicar (la lista no lleva jerga de DNS).
  const record = page.getByRole('dialog', { name: host });
  await expect(record).toContainText('Pendiente');
  await expect(record).toContainText(`_dentalix-verify.${host}`);
  await expect(record).toContainText('dentalix-verify=');

  // Sin el TXT publicado sigue Pendiente (y se avisa).
  await record.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText(/Aún no vemos el registro TXT/)).toBeVisible({ timeout: 15_000 });
  await expect(record).toContainText('Pendiente');
  await page.keyboard.press('Escape');
  await expect(record).toBeHidden();

  const list = page.getByRole('table', { name: 'Dominios propios' });
  await expect(list.getByRole('row').filter({ hasText: host })).toContainText('Pendiente');

  // Persistido en la API.
  await page.reload();
  await expect(
    page.getByRole('table', { name: 'Dominios propios' }).getByRole('row').filter({ hasText: host }),
  ).toContainText('Pendiente', { timeout: 15_000 });

  // Eliminar, desde el «⋯» de la fila, con confirmación.
  await page.getByRole('button', { name: `Acciones de ${host}` }).click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByRole('heading', { name: `¿Eliminar ${host}?` })).toBeVisible();
  await confirm.getByRole('button', { name: 'Eliminar dominio' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText('Todavía no hay dominios propios.')).toBeVisible();
});

test('recepción: no ve la entrada en Ajustes, la pantalla es de administración y la API responde 403', async ({
  page,
  request,
}) => {
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients`);
  await page.getByRole('button', { name: new RegExp(reception.fullName, 'i') }).first().click();
  await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  await expect(page.getByRole('link', { name: 'Horarios' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Dominios propios' })).toHaveCount(0);

  await page.goto(`${origin}/settings/dominios`);
  await expect(page.getByText('Solo administración gestiona los dominios propios.')).toBeVisible({
    timeout: 15_000,
  });

  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': new URL(origin).host },
    data: { email: reception.email, password },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const res = await request.get(`${API_URL}/domains`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': new URL(origin).host },
  });
  expect(res.status()).toBe(403);
});

test('API: DELETE /domains con un id que no es UUID es 400 y uno inexistente es 404', async ({
  request,
}) => {
  const bad = await request.delete(`${API_URL}/domains/no-es-un-uuid`, { headers: session.headers });
  expect(bad.status()).toBe(400);
  const missing = await request.delete(`${API_URL}/domains/${randomUUID()}`, {
    headers: session.headers,
  });
  expect(missing.status()).toBe(404);
});

test('móvil (390 px): la lista y el modal caben sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/dominios`);
  await expect(page.getByRole('heading', { name: 'Dominios propios' })).toBeVisible();

  await page.getByRole('button', { name: 'Añadir dominio' }).click();
  const dialog = page.getByRole('dialog');
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByLabel('Dominio').fill(host);
  await dialog.getByRole('button', { name: 'Añadir dominio' }).click();

  // El diálogo del TXT también cabe.
  const record = page.getByRole('dialog', { name: host });
  await expect(record).toContainText(`_dentalix-verify.${host}`);
  await expectDialogInsideViewport(page, record);
  await page.keyboard.press('Escape');
  await expect(record).toBeHidden();

  // En el teléfono, la lista es de tarjetas.
  const item = page.getByRole('list', { name: 'Dominios propios' }).getByRole('listitem').filter({ hasText: host });
  await expect(item).toContainText('Pendiente');
  await expectNoHorizontalScroll(page);
});
