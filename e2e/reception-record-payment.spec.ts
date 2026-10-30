import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-067): recepción cobra desde el ESTADO DE CUENTA, sin entrar al plan de
 * tratamiento (que es clínico y no ve).
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API), que ya
 * trae una cuenta de recepción y otra de administración:
 *   - la administradora crea por la API un paciente con un plan en COP con un
 *     procedimiento aceptado (lo facturable), y otro paciente sin planes;
 *   - recepción inicia sesión en la web, abre la ficha → «Estado de cuenta» →
 *     «Registrar abono»: el modal propone el plan, valida en español, registra
 *     el abono y el estado de cuenta se recarga con él;
 *   - el abono aparece en la CAJA de hoy;
 *   - «Plan de cuotas» crea el calendario del mismo plan y aparecen las cuotas;
 *   - el paciente sin planes dice claramente que no hay nada que cobrar.
 * Se ejecuta en escritorio (1440px) y en móvil (390px, sin scroll horizontal ni
 * en la página ni en el modal).
 *
 * Requiere la API con la demo sembrada y la web (ver `playwright.config.ts`).
 * Credenciales y subdominio por entorno, con los valores del seed por defecto.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';

const PLAN_PRICE = 800_000;
const PAYMENT = 125_000;

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

// Mismo formateador que la app (`formatCurrency`, locale `es`). Solo la cifra
// («125.000,00»): entre ella y «COP» va un espacio duro.
const cop = new Intl.NumberFormat('es', { style: 'currency', currency: 'COP' });
function figure(amount: number): string {
  return cop.format(amount).split(/\s/)[0];
}

/** Siembra como ADMIN (el plan de tratamiento es clínico: recepción no lo crea). */
async function seed(
  request: APIRequestContext,
  origin: string,
  tag: string,
): Promise<{ patientId: string; emptyPatientId: string; lastName: string }> {
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

  const lastName = `Cobro${tag}`;
  const patient = await send<{ id: string }>('post', '/patients', {
    firstName: 'Recepción',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `DX67P${tag}`.slice(0, 20),
    sex: 'F',
  });
  const empty = await send<{ id: string }>('post', '/patients', {
    firstName: 'Recepción',
    lastName: `SinPlan${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX67E${tag}`.slice(0, 20),
    sex: 'M',
  });
  const catalog = await send<{ id: string }>('post', '/catalog/items', {
    code: `dx67-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Corona DX067 ${tag}`,
    color: '#3366CC',
    defaultPrice: PLAN_PRICE,
  });
  const plan = await send<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  const item = await send<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
    price: PLAN_PRICE,
  });
  await send('patch', `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
  return { patientId: patient.id, emptyPatientId: empty.id, lastName };
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
  test(`recepción registra un abono y un plan de cuotas desde el estado de cuenta (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}${viewport.width}`;
    const { patientId, emptyPatientId, lastName } = await seed(page.request, origin, tag);

    // --- Recepción inicia sesión en la web.
    await page.goto(`${origin}/login`);
    await waitForHydratedForm(page);
    await page.getByLabel('Correo electrónico').fill(RECEPTION_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    // Desde DX-062 la sesión no deja nada en localStorage: el refresh vive en la
    // cookie HttpOnly del host de la clínica.
    await expect
      .poll(async () => Boolean((await sessionCookie(page, origin))?.httpOnly), { timeout: 15_000 })
      .toBe(true);
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });

    // --- Ficha → «Estado de cuenta»: sin pestaña clínica, con los botones de cobro.
    await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
    const tabs = page.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: 'Estado de cuenta' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 15_000 },
    );
    await expect(tabs.getByRole('tab', { name: 'Plan de tratamiento' })).toHaveCount(0);
    const panel = page.locator('#tabpanel-account-statement');
    await expect(panel.getByRole('region', { name: 'Resumen en COP' })).toBeVisible({
      timeout: 15_000,
    });

    // --- «Registrar abono».
    await panel.getByRole('button', { name: 'Registrar abono' }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
    await expect(dialog).toBeVisible();
    const planSelect = dialog.getByLabel('Plan');
    await expect(planSelect).toBeVisible({ timeout: 10_000 });
    // El plan propuesto, nombrado sin nada clínico: fecha, estado y saldo.
    await expect(planSelect.locator('option:checked')).toHaveText(
      /^Plan del \d{2}\/\d{2}\/\d{4} · Borrador · Saldo COP\s800\.000,00/,
    );
    await expect(dialog).not.toContainText(`Corona DX067 ${tag}`);
    await expect(dialog.getByLabel('Moneda')).toHaveValue('COP');
    if (viewport.width === 390) {
      // Medido al terminar la animación de entrada del diálogo.
      const box = await dialog.evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(viewport.width);
      // El select recorta el nombre largo del plan: el saldo se lee debajo.
      await expect(dialog).toContainText(`Saldo COP ${figure(PLAN_PRICE)}`);
      await expectNoHorizontalScroll(page);
    }

    // Sin importe: no registra y lo dice en español.
    const submit = dialog.getByRole('button', { name: 'Registrar abono' });
    await submit.click();
    await expect(dialog.getByRole('alert')).toContainText('Escribe un importe mayor que 0.');

    await dialog.getByLabel('Importe').fill(String(PAYMENT));
    await dialog.getByLabel('Método').selectOption({ label: 'Efectivo' });
    await submit.click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Abono registrado' })).toBeVisible();

    // El estado de cuenta se recarga con el abono y el saldo nuevo.
    const summary = panel.getByRole('region', { name: 'Resumen en COP' });
    await expect(summary.getByTestId('paid')).toContainText(
      figure(PAYMENT),
      { timeout: 10_000 },
    );
    await expect(summary.getByTestId('balance')).toContainText(
      figure(PLAN_PRICE - PAYMENT),
    );
    const movements = panel.getByRole('table', { name: 'Movimientos (abonos)' });
    await expect(movements.getByRole('row').filter({ hasText: 'Efectivo' })).toHaveCount(1);

    // --- «Plan de cuotas» del mismo plan.
    await panel.getByRole('button', { name: 'Plan de cuotas' }).click();
    const planDialog = page.getByRole('dialog', { name: 'Crear plan de pagos' });
    await expect(planDialog.getByLabel('Plan')).toBeVisible({ timeout: 10_000 });
    await expect(planDialog.getByLabel('Total a financiar')).toHaveValue(String(PLAN_PRICE));
    await planDialog.getByLabel('N.º de cuotas').fill('4');
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await planDialog.getByRole('button', { name: 'Crear' }).click();
    await expect(planDialog).toBeHidden({ timeout: 10_000 });
    await expect(
      page.getByRole('status').filter({ hasText: 'Plan de cuotas creado' }),
    ).toBeVisible();
    await expect(panel.getByRole('table', { name: 'Calendario de cuotas' })).toBeVisible({
      timeout: 10_000,
    });

    // Volver a abrirlo: el plan ya tiene cuotas y no se puede elegir.
    await panel.getByRole('button', { name: 'Plan de cuotas' }).click();
    await expect(planDialog).toContainText('ya tienen un plan de cuotas activo', {
      timeout: 10_000,
    });
    await expect(planDialog.getByRole('button', { name: 'Crear' })).toBeDisabled();
    await planDialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(planDialog).toBeHidden();

    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await expect(page.getByText('Insufficient role')).toHaveCount(0);

    // --- Caja de hoy: el abono, a nombre del paciente.
    await page.goto(`${origin}/caja`);
    const cash = page.getByRole('table', { name: 'Abonos del período' });
    await expect(cash).toBeVisible({ timeout: 15_000 });
    const row = cash.getByRole('row').filter({ hasText: lastName });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(figure(PAYMENT));
    // Registrado hoy con fecha de pago de hoy: no hace falta aclararlo.
    await expect(row).not.toContainText('Registrado');
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // --- Paciente sin planes: mensaje claro, sin formulario.
    await page.goto(`${origin}/patients/${emptyPatientId}?tab=account-statement`);
    const emptyPanel = page.locator('#tabpanel-account-statement');
    await emptyPanel.getByRole('button', { name: 'Registrar abono' }).click({ timeout: 15_000 });
    const emptyDialog = page.getByRole('dialog', { name: 'Registrar abono' });
    await expect(emptyDialog).toContainText('Este paciente no tiene planes por cobrar.', {
      timeout: 10_000,
    });
    await expect(emptyDialog.getByLabel('Importe')).toHaveCount(0);
    await expect(emptyDialog.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
  });
}
