import { readFile } from 'node:fs/promises';
import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { DEMO_CURRENCY } from './support/demo';
import { waitForAnimationsSettled } from './support/touch-targets';
import { dataList, dataListRows } from './support/data-list';

/**
 * e2e (DX-395): medio y referencia en el estado de cuenta, filtro de Caja por
 * medio con su CSV, y el formulario de abono accesible.
 *
 * Contra la clínica DEMO sembrada (`npm run seed:demo` en la API), que trae
 * «Pago móvil» (digital, pide referencia):
 *   - recepción registra un abono con «Pago móvil»: sin referencia, el campo
 *     queda `aria-invalid` y recibe el foco; con ella, se registra;
 *   - la misma referencia con guiones o puntos avisa de repetida y el foco va
 *     al motivo; sin motivo, el motivo queda `aria-invalid`;
 *   - el estado de cuenta y su impreso dicen «Pago móvil · Ref. …»;
 *   - la Caja filtra por «Pago móvil» y su CSV lleva medio y referencia;
 *   - a 390 px los controles del modal y de Ajustes › Caja miden ≥ 44 px.
 * En 1440 px y 390 px (sin scroll horizontal).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const MOBILE = 'Pago móvil';
const TOUCH_MIN = 44;

const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

/** Paciente con un plan en la moneda de la sede (USD) aceptado, sembrado como ADMIN por la API. */
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
    firstName: 'Estado',
    lastName: `Medio${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX395${tag}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await send<{ id: string }>('post', '/catalog/items', {
    code: `dx395-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Corona DX395 ${tag}`,
    color: '#3366CC',
    defaultPrice: 900,
  });
  const plan = await send<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, {
    currency: DEMO_CURRENCY,
  });
  const item = await send<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
    price: 900,
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

/** Cada control visible de `scope` (botones, entradas y selectores) mide ≥ 44 px de alto. */
async function expectTouchTargets(scope: Locator): Promise<void> {
  // En reposo: la entrada de un diálogo (o de la tarjeta) escala los controles.
  await waitForAnimationsSettled(scope);
  const controls = scope.locator('button, select, input:not([type=checkbox]):not([type=radio])');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    const label =
      (await control.getAttribute('aria-label')) ?? (await control.getAttribute('id')) ?? (await control.innerText());
    // Redondeo: la animación de entrada del diálogo deja décimas de píxel.
    const height = Math.round(box?.height ?? 0);
    expect(height, `«${label}» mide ${height} px de alto`).toBeGreaterThanOrEqual(TOUCH_MIN);
  }
}

async function expectCloseTouchTarget(dialog: Locator): Promise<void> {
  const box = await dialog.getByRole('button', { name: 'Cerrar' }).boundingBox();
  expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(TOUCH_MIN);
  expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(TOUCH_MIN);
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  const mobile = viewport.width === 390;

  test(`estado de cuenta con medio y referencia y caja por medio (${viewport.name})`, async ({ browser }) => {
    // Dos sesiones, varias pantallas y una descarga: más que el tope por defecto.
    test.setTimeout(180_000);
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}${viewport.width}`;
    // Una referencia por corrida: la demo guarda las anteriores (±90 días).
    const digits = `${Date.now()}`.slice(-6);
    const reference = `ABC ${digits}${viewport.width}`;
    const dashed = `ABC-${digits}.${viewport.width}`;

    // --- ADMIN: Ajustes › Caja con controles táctiles en móvil.
    const adminContext = await browser.newContext({ viewport });
    const admin = await adminContext.newPage();
    await login(admin, origin, ADMIN_EMAIL);
    const patientId = await seedPatient(admin.request, origin, tag);
    await admin.goto(`${origin}/settings/caja`);
    const section = admin.getByRole('region', { name: 'Medios de pago' });
    await expect(section.getByText(MOBILE).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(admin);
    if (mobile) {
      await expectTouchTargets(admin.getByRole('main'));
      await section.getByRole('button', { name: 'Nuevo medio' }).click();
      const form = admin.getByRole('dialog', { name: 'Nuevo medio de pago' });
      await expectTouchTargets(form);
      await expectCloseTouchTarget(form);
      // Sin el globo nativo: el nombre vacío da el mensaje propio y el foco.
      await form.getByRole('button', { name: 'Crear medio' }).click();
      const name = form.getByLabel('Nombre');
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(name).toBeFocused();
      await expect(form).toContainText('Escribe un nombre (hasta 60 caracteres).');
      await form.getByRole('button', { name: 'Cancelar' }).click();
    }
    await adminContext.close();

    // --- Recepción: «Registrar abono» con «Pago móvil».
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    await login(page, origin, RECEPTION_EMAIL);
    await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
    const panel = page.locator('#tabpanel-account-statement');

    async function openPayment(): Promise<Locator> {
      await panel.getByRole('button', { name: 'Registrar abono' }).click();
      const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
      await expect(dialog.getByLabel('Plan')).toBeVisible({ timeout: 15_000 });
      await dialog.getByLabel('Importe').fill('50');
      await dialog.getByLabel('Método').selectOption({ label: MOBILE });
      return dialog;
    }

    let dialog = await openPayment();
    if (mobile) {
      await expectTouchTargets(dialog);
      await expectCloseTouchTarget(dialog);
    }
    // Sin referencia: el campo queda inválido y recibe el foco.
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    const referenceField = dialog.getByLabel('Referencia (obligatoria)');
    await expect(referenceField).toHaveAttribute('aria-invalid', 'true');
    await expect(referenceField).toBeFocused();
    await expect(dialog).toContainText('Este medio de pago pide la referencia del pago.');
    await referenceField.fill(reference);
    if (mobile) await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // La misma referencia con guiones y puntos avisa; el foco va al motivo.
    dialog = await openPayment();
    await dialog.getByLabel('Referencia (obligatoria)').fill(dashed);
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog.getByText(/Esta referencia ya se usó/)).toBeVisible({ timeout: 10_000 });
    const reason = dialog.getByLabel('Motivo para registrarla igualmente');
    await expect(reason).toBeFocused();
    if (mobile) await expectTouchTargets(dialog);
    await dialog.getByLabel('Importe').focus();
    await dialog.getByRole('button', { name: 'Registrar igualmente' }).click();
    await expect(reason).toHaveAttribute('aria-invalid', 'true');
    await expect(reason).toBeFocused();
    await expect(dialog).toContainText('Escribe el motivo para registrar la referencia repetida.');
    await reason.fill('Dos cuotas con la misma operación');
    await dialog.getByRole('button', { name: 'Registrar igualmente' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // --- Estado de cuenta: el medio de la clínica y la referencia.
    const movements = dataList(panel, /movimientos/i);
    await expect(movements).toContainText(`${MOBILE} · Ref. ${reference}`, { timeout: 15_000 });
    await expect(movements).toContainText(`${MOBILE} · Ref. ${dashed}`);
    await expect(movements).not.toContainText('Transferencia');
    await expectNoHorizontalScroll(page);

    // --- El impreso dice lo mismo.
    const print = await context.newPage();
    await print.goto(`${origin}/print/patients/${patientId}/account-statement`);
    await expect(print.getByRole('table', { name: /movimientos/i })).toContainText(
      `${MOBILE} · Ref. ${reference}`,
      { timeout: 15_000 },
    );
    await print.close();

    // --- Caja: filtro por «Pago móvil» y CSV con medio y referencia.
    await page.goto(`${origin}/caja`);
    const medium = page.getByRole('combobox', { name: 'Medio de pago' });
    await expect(medium.getByRole('option', { name: MOBILE })).toBeAttached({ timeout: 15_000 });
    await medium.selectOption({ label: MOBILE });
    const rows = dataListRows(dataList(page, /abonos del período/i));
    await expect(page.getByText(`Ref. ${reference}`).first()).toBeVisible({ timeout: 15_000 });
    await expect(rows.filter({ hasText: 'Efectivo' })).toHaveCount(0);
    if (mobile) {
      expect((await medium.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(TOUCH_MIN);
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^caja-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile((await file.path()) as string, 'utf8');
    expect(csv).toContain('Fecha,Sede,Paciente,Destino,Medio,Referencia,Factura externa,Moneda,Importe');
    expect(csv).toContain(`"${MOBILE}","${reference}"`);
    expect(csv).not.toContain('"Efectivo"');
    await expect(page.getByText('Caja exportada.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await context.close();
  });
}
