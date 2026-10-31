import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-027): caja por turno.
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API), que
 * deja a recepción con una caja abierta en la sede principal:
 *   - la API cierra la caja abierta que tenga recepción (para empezar limpio)
 *     y deja los ajustes de caja por defecto;
 *   - recepción, en Caja → Turnos, abre su caja con un fondo; la
 *     administradora crea por la API un paciente con plan y recepción le cobra
 *     en efectivo por la API: el abono entra en su caja (esperado = fondo +
 *     cobro);
 *   - recepción cierra con un arqueo que no cuadra: sin motivo no deja, con
 *     motivo guarda contado y diferencia; el turno sale «Cerrada» en la lista;
 *   - el informe de cierre imprimible (A4) dice fondo, cobros, contado,
 *     diferencia y quién abrió y cerró; en `media: print` solo queda el
 *     documento y el PDF sale en UNA hoja A4.
 * En escritorio (1440px) y en móvil (390px, sin scroll horizontal).
 *
 * DX-252 (TST-031): la administradora abre un turno CERRADO de recepción, lo
 * corrige con un ajuste (que cuenta en SU caja abierta de la sede: así no cae
 * en la próxima caja de recepción) y lo reabre con motivo; los dos quedan en
 * el informe del turno. También a 1440 y 390 px.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

const usd = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' });
function figure(amount: number): string {
  return usd.format(amount).split(/\s/)[0];
}

interface Expected {
  currency: string;
  method: string;
  expected: number;
}

async function apiLogin(request: APIRequestContext, host: string, email: string): Promise<Record<string, string>> {
  const res = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `login ${email} falló: ${await res.text()}`).toBeTruthy();
  const token = ((await res.json()) as { accessToken: string }).accessToken;
  return { 'X-Tenant-Host': host, Authorization: `Bearer ${token}` };
}

async function post<T>(request: APIRequestContext, headers: Record<string, string>, path: string, data: object): Promise<T> {
  const res = await request.post(`${API_URL}${path}`, { headers, data });
  expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Ajustes por defecto y la caja de recepción en la sede principal, cerrada. */
async function startClean(request: APIRequestContext, host: string) {
  const admin = await apiLogin(request, host, ADMIN_EMAIL);
  const reception = await apiLogin(request, host, RECEPTION_EMAIL);
  const settings = await request.put(`${API_URL}/cash-sessions/settings`, {
    headers: admin,
    data: { requireOpenSession: false, blindClose: false },
  });
  expect(settings.ok(), await settings.text()).toBeTruthy();
  const current = await request.get(`${API_URL}/cash-sessions/current`, { headers: reception });
  const body = (await current.json()) as { session: { id: string; expected: Expected[] } | null };
  if (body.session) {
    await post(request, reception, `/cash-sessions/${body.session.id}/close`, {
      counts: body.session.expected.map((l) => ({ currency: l.currency, method: l.method, counted: Math.max(0, l.expected) })),
      differenceReason: 'Cierre previo a la prueba e2e',
    });
  }
  return { admin, reception };
}

async function webLogin(page: Page, origin: string, email: string): Promise<void> {
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

interface CurrentSession {
  session: { id: string; expected: Expected[]; adjustments: { amount: number; reason: string }[] } | null;
}

/** Cierra, si la hay, la caja abierta de quien trae `headers` (cuadrada). */
async function closeOwnSession(request: APIRequestContext, headers: Record<string, string>): Promise<void> {
  const current = await request.get(`${API_URL}/cash-sessions/current`, { headers });
  expect(current.ok(), await current.text()).toBeTruthy();
  const { session } = (await current.json()) as CurrentSession;
  if (!session) return;
  await post(request, headers, `/cash-sessions/${session.id}/close`, {
    counts: session.expected.map((l) => ({ currency: l.currency, method: l.method, counted: Math.max(0, l.expected) })),
    differenceReason: 'Cierre de limpieza de la prueba e2e',
  });
}

/** Nº de hojas de un PDF (cuenta los objetos /Type /Page, no /Pages). */
function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`recepción abre su caja, cobra, cierra con arqueo y saca el informe A4 (${viewport.name})`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const host = new URL(origin).host;
    const { admin, reception } = await startClean(page.request, host);
    const tag = `${suffix}${viewport.width}`;
    const FLOAT = 100_000;
    const CHARGE = 45_000;

    await context.addInitScript(() => {
      window.print = () => undefined;
    });
    await webLogin(page, origin, RECEPTION_EMAIL);
    await page.goto(`${origin}/caja?tab=turnos`);
    await expect(page.getByRole('tab', { name: 'Turnos' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('No tienes la caja abierta en esta sede.')).toBeVisible({ timeout: 15_000 });
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // Abrir con fondo.
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    const openDialog = page.getByRole('dialog', { name: 'Abrir caja' });
    if (viewport.width === 390) await expectDialogInsideViewport(page, openDialog);
    await openDialog.getByLabel('Importe del fondo 1').fill(String(FLOAT));
    await openDialog.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByText('Caja abierta.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Cerrar caja' })).toBeVisible();

    // Un cobro en efectivo de recepción entra en su caja.
    const patient = await post<{ id: string }>(page.request, admin, '/patients', {
      firstName: 'Turno',
      lastName: `Caja${tag}`,
      docType: 'NATIONAL_ID',
      docNumber: `27${Date.now().toString().slice(-8)}`,
      sex: 'F',
    });
    const plan = await post<{ id: string }>(page.request, admin, `/patients/${patient.id}/treatment-plans`, {
      currency: 'USD',
    });
    await post(page.request, reception, `/treatment-plans/${plan.id}/payments`, {
      amount: CHARGE,
      currency: 'USD',
      paidAt: new Date().toISOString(),
      method: 'CASH',
    });
    await page.reload();
    const expectedTotal = FLOAT + CHARGE;
    await expect(page.getByText('Esperado hasta ahora')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(figure(expectedTotal)).first()).toBeVisible();

    // Cerrar: no cuadra por 1.000 → exige motivo.
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    const closeDialog = page.getByRole('dialog', { name: 'Cerrar caja' });
    if (viewport.width === 390) await expectDialogInsideViewport(page, closeDialog);
    await closeDialog.getByLabel('Contado en efectivo (USD)').fill(String(expectedTotal - 1_000));
    await closeDialog.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(closeDialog.getByText(/explica el motivo/)).toBeVisible();
    await closeDialog.getByLabel('Motivo de la diferencia').fill('Faltó cambio en monedas');
    await closeDialog.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(page.getByText('Caja cerrada: el arqueo quedó guardado.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No tienes la caja abierta en esta sede.')).toBeVisible();

    // DataList: tabla desde 640 px; en el teléfono, una tarjeta por turno (toda ella abre el turno).
    const narrow = viewport.width === 390;
    const listing = page.getByRole(narrow ? 'list' : 'table', { name: 'Turnos de caja' });
    const row = listing.getByRole(narrow ? 'listitem' : 'row').filter({ hasText: 'Cerrada' }).first();
    await expect(row).toContainText(figure(-1_000));
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // Ficha del turno: inmutable (sin «Cerrar caja»), con el informe.
    await row.getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: 'Turno de caja' })).toBeVisible({ timeout: 15_000 });
    const doc = page.getByTestId('cash-session-report');
    await expect(doc).toContainText('Informe de cierre de caja');
    await expect(doc).toContainText('Faltó cambio en monedas');
    await expect(page.getByRole('button', { name: 'Cerrar caja' })).toHaveCount(0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    const [report] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: 'Informe imprimible' }).click(),
    ]);
    await report.setViewportSize({ width: viewport.width, height: viewport.height });
    const printed = report.getByTestId('cash-session-report');
    await expect(printed).toContainText('Informe de cierre de caja', { timeout: 15_000 });
    await expect(printed).toContainText(figure(FLOAT));
    await expect(printed).toContainText(figure(CHARGE));
    await expect(printed).toContainText(figure(expectedTotal - 1_000));
    await expect(printed).toContainText('Paola Martínez Ruiz');
    await expect(printed).toContainText('Fecha de bloqueo sugerida');
    if (viewport.width === 390) await expectNoHorizontalScroll(report);
    const toolbar = report.getByRole('toolbar', { name: 'Acciones del informe' });
    await expect(toolbar).toBeVisible();
    await report.emulateMedia({ media: 'print' });
    await expect(toolbar).toBeHidden();
    await expect(printed).toBeVisible();
    if (viewport.width === 1440) {
      const pdf = await report.pdf({ preferCSSPageSize: true });
      expect(pdfPageCount(pdf)).toBe(1);
    }
    await report.close();
  });
}

test('abrir otra caja en la misma sede es 409 y un dentista no tiene acceso (403 en español)', async ({ page }) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const host = new URL(origin).host;
  const { reception } = await startClean(page.request, host);
  const first = await page.request.post(`${API_URL}/cash-sessions/open`, { headers: reception, data: { floats: [] } });
  expect(first.status()).toBe(201);
  const second = await page.request.post(`${API_URL}/cash-sessions/open`, { headers: reception, data: { floats: [] } });
  expect(second.status()).toBe(409);
  expect(((await second.json()) as { message: string }).message).toMatch(/Ya tienes una caja abierta/);
  const dentist = await apiLogin(page.request, host, process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app');
  const denied = await page.request.get(`${API_URL}/cash-sessions`, { headers: dentist });
  expect(denied.status()).toBe(403);
  expect(((await denied.json()) as { message: string }).message).toMatch(/Tu rol no tiene acceso a la caja/);
});

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`ADMIN reabre una caja cerrada y la corrige con un ajuste (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const host = new URL(origin).host;
    const { admin, reception } = await startClean(page.request, host);
    await closeOwnSession(page.request, admin);
    const tag = `${suffix}${viewport.width}`;
    const narrow = viewport.width === 390;

    try {
      // Un turno de recepción, cerrado con un arqueo que cuadra.
      const shift = await post<{ id: string }>(page.request, reception, '/cash-sessions/open', {
        floats: [{ currency: 'USD', amount: 20_000 }],
      });
      await post(page.request, reception, `/cash-sessions/${shift.id}/close`, {
        counts: [{ currency: 'USD', method: 'CASH', counted: 20_000 }],
      });
      // La caja de la administradora: el ajuste cuenta en ella.
      await post(page.request, admin, '/cash-sessions/open', { floats: [] });

      await webLogin(page, origin, ADMIN_EMAIL);
      await page.goto(`${origin}/caja/turnos/${shift.id}`);
      await expect(page.getByRole('heading', { name: 'Turno de caja' })).toBeVisible({ timeout: 15_000 });
      const doc = page.getByTestId('cash-session-report');
      await expect(doc).toContainText('Informe de cierre de caja');
      await expect(page.getByRole('button', { name: 'Cerrar caja' })).toHaveCount(0);
      if (narrow) await expectNoHorizontalScroll(page);

      // Corregir: un ajuste que suma 5.000 en efectivo, con motivo.
      const adjustReason = `Abono en efectivo sin registrar ${tag}`;
      await page.getByRole('button', { name: 'Corregir con un ajuste' }).click();
      const adjust = page.getByRole('dialog', { name: 'Corregir el cierre' });
      if (narrow) await expectDialogInsideViewport(page, adjust);
      await adjust.getByLabel('Tipo de ajuste').selectOption({ label: 'Suma (faltó registrar dinero)' });
      await adjust.getByLabel('Importe').fill('5000');
      await adjust.getByRole('button', { name: 'Registrar ajuste' }).click();
      await expect(adjust.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeVisible();
      await adjust.getByLabel('Motivo').fill(adjustReason);
      await adjust.getByRole('button', { name: 'Registrar ajuste' }).click();
      await expect(adjust).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText('Ajuste registrado: cuenta en tu caja abierta')).toBeVisible();
      await expect(doc).toContainText('Ajustes posteriores a este cierre', { timeout: 15_000 });
      await expect(doc).toContainText(adjustReason);
      if (narrow) await expectNoHorizontalScroll(page);

      // Reabrir: sin motivo no deja; con motivo, el turno vuelve a estar abierto.
      const reopenReason = `Faltó contar un sobre ${tag}`;
      await page.getByRole('button', { name: 'Reabrir' }).click();
      const reopen = page.getByRole('dialog', { name: '¿Reabrir esta caja?' });
      if (narrow) await expectDialogInsideViewport(page, reopen);
      await reopen.getByRole('button', { name: 'Reabrir caja' }).click();
      await expect(reopen.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeVisible();
      await reopen.getByLabel('Motivo de la reapertura').fill(reopenReason);
      await reopen.getByRole('button', { name: 'Reabrir caja' }).click();
      await expect(reopen).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText('Caja reabierta. El cierre anterior queda en el historial.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cerrar caja' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Reabrir' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Corregir con un ajuste' })).toHaveCount(0);
      await expect(doc).toContainText('Historial');
      await expect(doc).toContainText(reopenReason);
      if (narrow) await expectNoHorizontalScroll(page);

      // El ajuste cuenta en la caja abierta de la administradora, no en la de recepción.
      const mine = await page.request.get(`${API_URL}/cash-sessions/current`, { headers: admin });
      const { session } = (await mine.json()) as CurrentSession;
      expect(session?.adjustments).toEqual(
        expect.arrayContaining([expect.objectContaining({ amount: 5_000, reason: adjustReason })]),
      );
    } finally {
      await closeOwnSession(page.request, admin);
      await closeOwnSession(page.request, reception);
    }
  });
}
