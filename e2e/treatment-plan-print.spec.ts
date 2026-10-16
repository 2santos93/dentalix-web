import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { registerClinicViaApi } from './support/api';

/**
 * e2e (DX-012): presupuesto imprimible del plan y aceptación firmada.
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API):
 *   - la administradora crea por la API un paciente con un plan en COP de dos
 *     procedimientos (uno con descuento);
 *   - en la ficha → «Plan de tratamiento», «Imprimir presupuesto» abre la vista
 *     A4 en otra pestaña con la clínica, la sede, el paciente, el profesional,
 *     los ítems (diente, procedimiento, cantidad, precio, descuento, subtotal),
 *     los totales y «Válido 30 días»; en `media: print` solo queda el documento
 *     y el PDF A4 sale en UNA hoja (sin hoja en blanco al final);
 *   - «Aceptar con firma»: sin firma no se puede; con la firma (puntero) el plan
 *     queda «Aceptado y firmado por … el …», sin «Quitar» ni «Agregar ítem», y
 *     la vista A4 enseña la firma;
 *   - recepción imprime el presupuesto desde el estado de cuenta, pero la API
 *     no le deja aceptarlo (403); otra clínica recibe 404.
 * En escritorio (1440px) y en móvil (390px, sin scroll horizontal).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';

const CROWN = 1_200_000;
const CROWN_DISCOUNT = 120_000;
const RESIN = 150_000;

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

// Mismo formateador que la app (`formatCurrency`, locale `es`). Solo la cifra
// («1.200.000,00»): entre ella y «COP» va un espacio duro.
const cop = new Intl.NumberFormat('es', { style: 'currency', currency: 'COP' });
function figure(amount: number): string {
  return cop.format(amount).split(/\s/)[0];
}

async function apiLogin(request: APIRequestContext, host: string, email: string): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `login ${email} falló: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Siembra como ADMIN: paciente + plan en COP con dos ítems (uno con descuento). */
async function seed(
  request: APIRequestContext,
  origin: string,
  tag: string,
): Promise<{ patientId: string; planId: string; fullName: string; labels: string[] }> {
  const host = new URL(origin).host;
  const headers = {
    'X-Tenant-Host': host,
    Authorization: `Bearer ${await apiLogin(request, host, ADMIN_EMAIL)}`,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const lastName = `Presupuesto${tag}`;
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Lucía',
    lastName,
    docType: 'CC',
    docNumber: `DX12${tag}`.slice(0, 20),
    sex: 'F',
  });
  const labels = [`Corona DX012 ${tag}`, `Resina DX012 ${tag}`];
  const crown = await post<{ id: string }>('/catalog/items', {
    code: `dx12c-${tag}`,
    kind: 'PROCEDURE',
    labelEs: labels[0],
    color: '#3366CC',
    defaultPrice: CROWN,
  });
  const resin = await post<{ id: string }>('/catalog/items', {
    code: `dx12r-${tag}`,
    kind: 'PROCEDURE',
    labelEs: labels[1],
    color: '#33CC66',
    defaultPrice: RESIN,
  });
  const plan = await post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  await post(`/treatment-plans/${plan.id}/items`, {
    toothNumber: '21',
    catalogItemId: crown.id,
    discount: CROWN_DISCOUNT,
  });
  await post(`/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    surfaces: ['OCCLUSAL'],
    catalogItemId: resin.id,
  });
  return { patientId: patient.id, planId: plan.id, fullName: `Lucía ${lastName}`, labels };
}

async function webLogin(page: Page, origin: string, email: string): Promise<void> {
  await page.goto(`${origin}/login`);
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

/** Un trazo con el ratón (Pointer Events: mismo camino que el dedo). */
async function signOn(page: Page, canvas: Locator): Promise<void> {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('lienzo sin caja');
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + 20 + i * 25, box.y + box.height / 2 + (i % 2 ? -18 : 18));
  }
  await page.mouse.up();
}

/** Nº de hojas de un PDF (cuenta los objetos /Type /Page, no /Pages). */
function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/** La vista A4: cabecera, ítems, totales y validez; en print, solo el documento y una hoja. */
async function expectPrintableQuote(
  printPage: Page,
  data: { fullName: string; labels: string[] },
  checkPdf: boolean,
): Promise<void> {
  const header = printPage.getByTestId('quote-header');
  await expect(header).toBeVisible({ timeout: 15_000 });
  await expect(header).toContainText('Presupuesto de tratamiento');
  await expect(header).toContainText('Sede principal');
  await expect(header).toContainText('Válido 30 días');
  await expect(printPage.getByTestId('quote-parties')).toContainText(data.fullName);
  await expect(printPage.getByTestId('quote-total-COP')).toContainText(
    figure(CROWN - CROWN_DISCOUNT + RESIN),
  );

  const toolbar = printPage.getByRole('toolbar', { name: 'Acciones del presupuesto' });
  await expect(toolbar).toBeVisible();
  await printPage.emulateMedia({ media: 'print' });
  await expect(toolbar).toBeHidden();
  // En papel siempre es tabla (también desde un móvil).
  const table = printPage.getByRole('table', { name: 'Procedimientos del presupuesto' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText([
    'Diente',
    'Procedimiento',
    'Cant.',
    'Precio',
    'Descuento',
    'Subtotal',
  ]);
  const crownRow = table.getByRole('row').filter({ hasText: data.labels[0] });
  await expect(crownRow).toContainText('21');
  await expect(crownRow).toContainText(figure(CROWN));
  await expect(crownRow).toContainText(`−${figure(CROWN_DISCOUNT)}`);
  await expect(crownRow).toContainText(figure(CROWN - CROWN_DISCOUNT));
  if (checkPdf) {
    const pdf = await printPage.pdf({ format: 'A4', preferCSSPageSize: true });
    expect(pdfPageCount(pdf)).toBe(1);
  }
  await printPage.emulateMedia({ media: 'screen' });
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`el profesional imprime el presupuesto y lo acepta con la firma del paciente (${viewport.name})`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}${viewport.width}`;
    const data = await seed(page.request, origin, tag);

    // La vista imprimible abre el diálogo de impresión: se neutraliza.
    await context.addInitScript(() => {
      window.print = () => undefined;
    });
    await webLogin(page, origin, ADMIN_EMAIL);
    await page.goto(`${origin}/patients/${data.patientId}?tab=treatment-plans`);
    const panel = page.locator('#tabpanel-treatment-plans');
    const printLink = panel.getByRole('link', { name: /Imprimir presupuesto/ });
    await expect(printLink).toBeVisible({ timeout: 15_000 });
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // --- 1. Imprimir: vista A4 en otra pestaña.
    const [printPage] = await Promise.all([context.waitForEvent('page'), printLink.click()]);
    await printPage.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(printPage).toHaveURL(
      new RegExp(`/print/patients/${data.patientId}/treatment-plans/${data.planId}$`),
    );
    await expectPrintableQuote(printPage, data, viewport.width === 1440);
    if (viewport.width === 390) await expectNoHorizontalScroll(printPage);
    await expect(printPage.getByTestId('quote-signature')).toContainText(
      'Firma de aceptación del paciente',
    );
    await printPage.close();

    // --- 2. Aceptar con firma.
    await panel.getByRole('button', { name: 'Aceptar con firma' }).click();
    const dialog = page.getByRole('dialog', { name: 'Aceptar presupuesto con firma' });
    const summary = dialog.getByRole('region', { name: 'Presupuesto a firmar' });
    await expect(summary).toContainText(data.labels[0], { timeout: 10_000 });
    await expect(summary).toContainText(figure(CROWN - CROWN_DISCOUNT + RESIN));
    await expect(dialog.getByLabel('Nombre de quien firma')).toHaveValue(data.fullName);
    if (viewport.width === 390) {
      const box = await dialog.evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(viewport.width);
      await expectNoHorizontalScroll(page);
    }
    const submit = dialog.getByRole('button', { name: 'Aceptar y firmar' });
    await expect(submit).toBeDisabled();
    await signOn(page, dialog.getByRole('img', { name: 'Firma del paciente' }));
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // --- 3. El plan queda aceptado, firmado y congelado.
    await expect(panel.getByText(`Aceptado y firmado por ${data.fullName} el`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(panel.getByText('Sus procedimientos y precios ya no se pueden cambiar.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Aceptar con firma' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Quitar$/ })).toHaveCount(0);
    await expect(panel.getByRole('form', { name: 'Agregar ítem' })).toHaveCount(0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // --- 4. La vista A4 enseña la firma.
    const [signedPage] = await Promise.all([
      context.waitForEvent('page'),
      panel.getByRole('link', { name: /Imprimir presupuesto/ }).click(),
    ]);
    const signature = signedPage.getByTestId('quote-signature');
    await expect(signature).toContainText(`Aceptado y firmado por ${data.fullName} el`, {
      timeout: 15_000,
    });
    await expect(signature.getByRole('img', { name: `Firma de ${data.fullName}` })).toBeVisible();
    await expect(signedPage.getByText('Huella SHA-256 de la aceptación')).toBeVisible();
    if (viewport.width === 1440) {
      await signedPage.emulateMedia({ media: 'print' });
      expect(pdfPageCount(await signedPage.pdf({ format: 'A4', preferCSSPageSize: true }))).toBe(1);
    }
    await signedPage.close();

    // --- 5. Volver a firmar: 409 (también por la API).
    const host = new URL(origin).host;
    const again = await page.request.post(
      `${API_URL}/patients/${data.patientId}/treatment-plans/${data.planId}/acceptance`,
      {
        headers: {
          'X-Tenant-Host': host,
          Authorization: `Bearer ${await apiLogin(page.request, host, ADMIN_EMAIL)}`,
        },
        data: {
          signerName: data.fullName,
          signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          contentHash: 'a'.repeat(64),
        },
      },
    );
    expect(again.status()).toBe(409);
  });
}

test('recepción imprime el presupuesto desde el estado de cuenta, pero no lo acepta; otra clínica: 404', async ({
  page,
  context,
}) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const host = new URL(origin).host;
  const data = await seed(page.request, origin, `${suffix}rec`);
  await context.addInitScript(() => {
    window.print = () => undefined;
  });

  await webLogin(page, origin, RECEPTION_EMAIL);
  await page.goto(`${origin}/patients/${data.patientId}?tab=account-statement`);
  const panel = page.locator('#tabpanel-account-statement');
  const plans = panel.getByRole('table', { name: 'Planes del paciente' });
  const link = plans.getByRole('link', { name: /^Presupuesto · Plan del/ });
  await expect(link).toBeVisible({ timeout: 15_000 });
  const [printPage] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await expectPrintableQuote(printPage, data, false);
  await expect(printPage.getByRole('link', { name: /Volver/ })).toHaveAttribute(
    'href',
    `/patients/${data.patientId}?tab=account-statement`,
  );

  // La API: recepción lee (200) pero no acepta (403).
  const receptionToken = await apiLogin(page.request, host, RECEPTION_EMAIL);
  const headers = { 'X-Tenant-Host': host, Authorization: `Bearer ${receptionToken}` };
  const quote = await page.request.get(
    `${API_URL}/patients/${data.patientId}/treatment-plans/${data.planId}/quote`,
    { headers },
  );
  expect(quote.status()).toBe(200);
  const accept = await page.request.post(
    `${API_URL}/patients/${data.patientId}/treatment-plans/${data.planId}/acceptance`,
    {
      headers,
      data: {
        signerName: data.fullName,
        signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        contentHash: ((await quote.json()) as { contentHash: string }).contentHash,
      },
    },
  );
  expect(accept.status()).toBe(403);

  // Otra clínica (registrada al vuelo) no ve el presupuesto: 404.
  const otherSub = `test-clinic-dx12-${suffix}`;
  const otherEmail = `dx12.${suffix}@example.com`;
  // DX-029: el registro se confirma desde el email (lo hace el helper).
  const otherSession = await registerClinicViaApi(page.request, {
    clinicName: `Otra DX012 ${suffix}`,
    subdomain: otherSub,
    email: otherEmail,
    password: 'Password123!',
    fullName: 'Otra Clínica',
  });
  const otherHost = new URL(tenantOrigin(otherSub)).host;
  const otherToken = otherSession.headers.Authorization.replace(/^Bearer /, '');
  const foreign = await page.request.get(
    `${API_URL}/patients/${data.patientId}/treatment-plans/${data.planId}/quote`,
    { headers: { 'X-Tenant-Host': otherHost, Authorization: `Bearer ${otherToken}` } },
  );
  expect(foreign.status()).toBe(404);
});
