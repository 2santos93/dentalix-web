import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-390): cobro dividido en varias formas de pago con un solo recibo.
 *
 * Contra la clínica DEMO sembrada (`npm run seed:demo` en la API), con sus
 * medios iniciales y «Pago móvil» (pide referencia):
 *   - recepción abre «Registrar abono», cobra una parte en efectivo en pesos y
 *     pulsa «Añadir otra forma de pago» para el resto por «Pago móvil» en
 *     dólares; el modal enseña el total y lo pendiente en la moneda del plan;
 *   - sin la referencia que pide el medio, el error sale en su campo;
 *   - el cobro deja dos abonos con el MISMO recibo, y ese recibo lleva las dos
 *     formas de pago.
 * En 1440 px y 390 px (sin scroll horizontal, «Añadir otra forma de pago» de
 * 44 px en móvil).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';

const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

interface Seeded {
  patientId: string;
  planId: string;
  headers: Record<string, string>;
}

/** Paciente con un plan en COP aceptado, sembrado como ADMIN por la API. */
async function seedPatient(request: APIRequestContext, origin: string, tag: string): Promise<Seeded> {
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
    firstName: 'Cobro',
    lastName: `Dividido${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX390${tag}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await send<{ id: string }>('post', '/catalog/items', {
    code: `dx390-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Corona DX390 ${tag}`,
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
  return { patientId: patient.id, planId: plan.id, headers };
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
  test(`cobro dividido en dos formas de pago con un solo recibo (${viewport.name})`, async ({ browser, request }) => {
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}${viewport.width}`;
    const seeded = await seedPatient(request, origin, tag);

    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await login(page, origin, RECEPTION_EMAIL);
    await page.goto(`${origin}/patients/${seeded.patientId}?tab=account-statement`);
    const panel = page.locator('#tabpanel-account-statement');
    await panel.getByRole('button', { name: 'Registrar abono' }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
    await expect(dialog.getByLabel('Plan')).toBeVisible({ timeout: 15_000 });

    // Primera forma de pago: efectivo en la moneda del plan.
    await dialog.locator('#rp-amount').fill('100000');
    await dialog.locator('#rp-method').selectOption({ label: 'Efectivo' });

    // «Añadir otra forma de pago»: el resto por «Pago móvil» en dólares.
    const add = dialog.getByRole('button', { name: 'Añadir otra forma de pago' });
    if (viewport.width === 390) {
      const box = await add.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await add.click();
    const second = dialog.getByTestId('split-line-2');
    await second.getByLabel('Importe').fill('20');
    await second.getByLabel('Moneda').selectOption('USD');
    await second.getByLabel('Método').selectOption({ label: 'Pago móvil' });

    // Total y pendiente en la moneda del plan.
    const summary = dialog.getByTestId('split-summary');
    await expect(summary).toContainText('Cobro en la moneda del plan (COP)');
    await expect(summary).toContainText('Pendiente del plan');
    await expect(summary).toContainText(/900\.000,00/);
    await expectNoHorizontalScroll(page);

    // La referencia que pide el medio se marca en SU campo.
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    const reference = second.getByLabel('Referencia (obligatoria)');
    await expect(reference).toHaveAttribute('aria-invalid', 'true');
    await expect(reference).toBeFocused();
    await reference.fill(`PM ${tag}`);
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(/Cobro registrado: .* en 2 formas de pago/)).toBeVisible();

    // Dos abonos con el MISMO recibo, y el recibo lleva las dos formas de pago.
    const list = await request.get(`${API_URL}/treatment-plans/${seeded.planId}/payments`, {
      headers: seeded.headers,
    });
    const payments = (await list.json()) as { id: string; splitId: string | null; receiptNumber: string }[];
    expect(payments).toHaveLength(2);
    expect(new Set(payments.map((p) => p.splitId)).size).toBe(1);
    expect(new Set(payments.map((p) => p.receiptNumber)).size).toBe(1);
    const receipt = await request.get(`${API_URL}/payments/${payments[0].id}/receipt`, {
      headers: seeded.headers,
    });
    const body = (await receipt.json()) as {
      split: { lines: { currency: string; paymentMethodName: string }[]; total: { currency: string } } | null;
    };
    expect(body.split?.lines.map((l) => [l.currency, l.paymentMethodName])).toEqual([
      ['COP', 'Efectivo'],
      ['USD', 'Pago móvil'],
    ]);
    expect(body.split?.total.currency).toBe('COP');
    await expectNoHorizontalScroll(page);
    await context.close();
  });
}
