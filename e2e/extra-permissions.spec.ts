import { test, expect, type APIRequestContext, type Browser, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { DEMO_CURRENCY, DEMO_PASSWORD, DEMO_SUBDOMAIN, DEMO_ADMIN_EMAIL } from './support/demo';
import { expectNoHorizontalScroll } from './support/layout';
import { axeViolations } from './support/axe';
import { staffPermissionsCopy } from '../src/components/staff/staff-permissions-copy';

/**
 * e2e (DX-090): permisos extra por miembro, en la clínica DEMO a 1440 y 390.
 *
 * En una clínica sin recepcionista, la asistente cobra:
 *   1. sin permiso, la asistente ve el plan del paciente pero NO «Registrar
 *      abono», y el menú no le ofrece la Caja;
 *   2. la administradora abre su ficha en Personal y enciende «Registrar
 *      abonos y operar su caja» (un interruptor accesible, sin errores de axe);
 *   3. la asistente recarga, registra un abono de USD 25 desde el plan y tiene
 *      la Caja en el menú; la fila del abono no le ofrece «Anular».
 * Al terminar, el permiso se retira (la demo es estado compartido, DX-337).
 */
const ASSISTANT_EMAIL = process.env.E2E_DEMO_ASSISTANT_EMAIL ?? 'asistente@demo.dentalix.app';
const PAY_LABEL = staffPermissionsCopy.labels.PAYMENT_REGISTER;

const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

interface AdminApi {
  headers: Record<string, string>;
  send<T>(method: 'get' | 'post' | 'patch' | 'put', path: string, data?: object): Promise<T>;
}

async function adminApi(request: APIRequestContext, origin: string): Promise<AdminApi> {
  const host = new URL(origin).host;
  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email: DEMO_ADMIN_EMAIL, password: DEMO_PASSWORD },
  });
  expect(login.ok(), `login admin falló: ${await login.text()}`).toBeTruthy();
  const headers = {
    'X-Tenant-Host': host,
    Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}`,
  };
  return {
    headers,
    async send<T>(method: 'get' | 'post' | 'patch' | 'put', path: string, data?: object): Promise<T> {
      const res = await request[method](`${API_URL}${path}`, { headers, ...(data ? { data } : {}) });
      expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
  };
}

/** Paciente con un plan aceptado en la moneda de la sede (USD), sembrado como ADMIN por la API. */
async function seedPatient(api: AdminApi, tag: string): Promise<string> {
  const patient = await api.send<{ id: string }>('post', '/patients', {
    firstName: 'Permiso',
    lastName: `Abono${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX090${tag}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await api.send<{ id: string }>('post', '/catalog/items', {
    code: `dx090-${tag}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Corona DX090 ${tag}`,
    color: '#3366CC',
    defaultPrice: 300,
  });
  const plan = await api.send<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, {
    currency: DEMO_CURRENCY,
  });
  const item = await api.send<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
    price: 300,
  });
  await api.send('patch', `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
  return patient.id;
}

async function login(page: Page, origin: string, email: string): Promise<void> {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect
    .poll(async () => Boolean((await sessionCookie(page, origin))?.httpOnly), { timeout: 15_000 })
    .toBe(true);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function newPage(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  return { context, page: await context.newPage() };
}

/** El menú (barra lateral, barra inferior y hoja «Más») ofrece la Caja. */
function cashLinks(page: Page) {
  return page.locator('a[href="/caja"]');
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`la ADMIN concede PAYMENT_REGISTER y la asistente registra un abono; sin él no ve el botón (${viewport.name})`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}${viewport.width}`;
    const api = await adminApi(request, origin);
    const staff = await api.send<{ userId: string; email: string }[]>('get', '/staff');
    const assistant = staff.find((m) => m.email === ASSISTANT_EMAIL);
    expect(assistant, 'la demo trae a la asistente').toBeTruthy();
    const assistantId = assistant!.userId;
    // Punto de partida conocido: sin permisos extra.
    await api.send('put', `/staff/${assistantId}/permissions`, { permissions: [] });
    const patientId = await seedPatient(api, tag);
    const planTab = `${origin}/patients/${patientId}?tab=treatment-plans`;

    try {
      // 1. Sin permiso: el plan se ve, pero sin «Registrar abono» ni Caja.
      const asst = await newPage(browser, viewport);
      await login(asst.page, origin, ASSISTANT_EMAIL);
      await asst.page.goto(planTab);
      // El detalle del plan cargó (en el móvil los ítems van plegados).
      await expect(asst.page.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 20_000 });
      await expect(asst.page.getByRole('button', { name: 'Registrar abono', exact: true })).toHaveCount(0);
      await expect(cashLinks(asst.page)).toHaveCount(0);
      await expectNoHorizontalScroll(asst.page);

      // 2. La administradora lo concede desde la ficha del miembro.
      const adm = await newPage(browser, viewport);
      await login(adm.page, origin, DEMO_ADMIN_EMAIL);
      await adm.page.goto(`${origin}/staff/${assistantId}`);
      const section = adm.page.getByRole('region', { name: staffPermissionsCopy.title });
      const toggle = section.getByRole('switch', { name: PAY_LABEL });
      await expect(toggle).not.toBeChecked({ timeout: 20_000 });
      await expect(toggle).toHaveAccessibleDescription(/No anula abonos/);
      await toggle.click();
      await expect(toggle).toBeChecked();
      await expect(adm.page.getByText(staffPermissionsCopy.granted(PAY_LABEL))).toBeVisible({ timeout: 10_000 });
      await expect(toggle).toBeEnabled();
      expect(await axeViolations(adm.page, section)).toEqual([]);
      await expectNoHorizontalScroll(adm.page);
      await adm.context.close();

      // 3. La asistente recarga: «Registrar abono» y la Caja aparecen.
      await asst.page.reload();
      const pay = asst.page.getByRole('button', { name: 'Registrar abono', exact: true });
      await expect(pay).toBeVisible({ timeout: 20_000 });
      await pay.click();
      const dialog = asst.page.getByRole('dialog', { name: 'Registrar abono' });
      await dialog.getByLabel('Monto').fill('25');
      await dialog.getByLabel('Método').selectOption({ label: 'Tarjeta' });
      if (viewport.width === 390) await expectNoHorizontalScroll(asst.page);
      await dialog.getByRole('button', { name: 'Registrar abono' }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await expect(asst.page.getByText(/Abono registrado: .*25/).first()).toBeVisible({ timeout: 10_000 });
      await expect(cashLinks(asst.page).first()).toBeAttached();

      // El abono está en el plan y no se le ofrece «Anular».
      const payments = await api.send<{ id: string; amount: number; voidedAt: string | null }[]>(
        'get',
        `/treatment-plans/${(await api.send<{ id: string }[]>('get', `/patients/${patientId}/treatment-plans`))[0].id}/payments`,
      );
      expect(payments.map((p) => p.amount)).toContain(25);
      await expect(asst.page.getByRole('menuitem', { name: /Anular/ })).toHaveCount(0);
      await expectNoHorizontalScroll(asst.page);
      await asst.context.close();
    } finally {
      await api.send('put', `/staff/${assistantId}/permissions`, { permissions: [] });
    }
  });
}
