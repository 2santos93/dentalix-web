import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-377): medios de pago de la clínica con referencia.
 *
 * Contra la clínica DEMO sembrada (`npm run seed:demo` en la API), que trae los
 * 4 medios iniciales y «Pago móvil» (pide referencia):
 *   - la administradora ve el catálogo en Ajustes › Caja y crea un medio
 *     digital propio que pide referencia;
 *   - recepción registra un abono con ese medio: sin referencia, el modal la
 *     pide; con ella, se registra; la misma referencia otra vez da el aviso de
 *     repetida, y con motivo se registra igualmente;
 *   - la caja de hoy muestra el medio, la referencia y el total por medio.
 * En 1440 px y 390 px (sin scroll horizontal).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';

const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

/** Paciente con un plan en COP aceptado, sembrado como ADMIN por la API. */
async function seedPatient(request: APIRequestContext, origin: string, tag: string): Promise<string> {
  const host = new URL(origin).host;
  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email: ADMIN_EMAIL, password: DEMO_PASSWORD },
  });
  expect(login.ok(), `login admin falló: ${await login.text()}`).toBeTruthy();
  const headers = {
    'X-Tenant-Host': host,
    Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}`,
  };
  async function send<T>(method: 'post' | 'patch', path: string, data: object): Promise<T> {
    const res = await request[method](`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await send<{ id: string }>('post', '/patients', {
    firstName: 'Referencia',
    lastName: `Medio${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX377${tag}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await send<{ id: string }>('post', '/catalog/items', {
    code: `dx377-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Corona DX377 ${tag}`,
    color: '#3366CC',
    defaultPrice: 900_000,
  });
  const plan = await send<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  const item = await send<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
    price: 900_000,
  });
  await send('patch', `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
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

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`medios de pago con referencia y aviso de repetida (${viewport.name})`, async ({ browser }) => {
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}${viewport.width}`;
    const methodName = `Billetera ${tag}`;
    const reference = `REF ${tag}`;

    // --- ADMIN: Ajustes › Caja, catálogo y alta de un medio que pide referencia.
    const adminContext = await browser.newContext({ viewport });
    const admin = await adminContext.newPage();
    await login(admin, origin, ADMIN_EMAIL);
    await admin.goto(`${origin}/settings/caja`);
    const section = admin.getByRole('region', { name: 'Medios de pago' });
    await expect(section.getByText('Pago móvil').first()).toBeVisible({ timeout: 15_000 });
    await section.getByRole('button', { name: 'Nuevo medio' }).click();
    const form = admin.getByRole('dialog', { name: 'Nuevo medio de pago' });
    await form.getByLabel('Nombre').fill(methodName);
    await form.getByLabel('Tipo base').selectOption({ label: 'Digital' });
    await expect(form.getByLabel('Pide referencia')).toBeChecked();
    await form.getByRole('button', { name: 'Crear medio' }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });
    await expect(section.getByText(methodName).first()).toBeVisible();
    await expectNoHorizontalScroll(admin);
    const patientId = await seedPatient(admin.request, origin, tag);
    await adminContext.close();

    // --- Recepción: «Registrar abono» con el medio nuevo.
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await login(page, origin, RECEPTION_EMAIL);
    await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
    const panel = page.locator('#tabpanel-account-statement');

    async function openPayment() {
      await panel.getByRole('button', { name: 'Registrar abono' }).click();
      const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
      await expect(dialog.getByLabel('Plan')).toBeVisible({ timeout: 15_000 });
      await dialog.getByLabel('Importe').fill('50000');
      await dialog.getByLabel('Método').selectOption({ label: methodName });
      return dialog;
    }

    let dialog = await openPayment();
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog).toContainText('Este medio de pago pide la referencia del pago.');
    await dialog.getByLabel('Referencia (obligatoria)').fill(reference);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // La misma referencia (sin espacios y en minúsculas cuenta igual) avisa.
    dialog = await openPayment();
    await dialog.getByLabel('Referencia (obligatoria)').fill(reference.replace(/\s/g, '').toLowerCase());
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog.getByText(/Esta referencia ya se usó/)).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel('Motivo para registrarla igualmente').fill('Dos cuotas con la misma operación');
    await dialog.getByRole('button', { name: 'Registrar igualmente' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // --- La caja de hoy: medio, referencia y total por medio.
    await page.goto(`${origin}/caja`);
    await expect(page.getByText(`Ref. ${reference}`).first()).toBeVisible({ timeout: 15_000 });
    const summary = page.getByRole('region', { name: /resumen del período/i });
    await expect(summary.getByRole('list', { name: /por método/i })).toContainText(methodName);
    await expectNoHorizontalScroll(page);
    await context.close();
  });
}
