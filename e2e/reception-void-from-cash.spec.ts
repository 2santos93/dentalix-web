import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-057): recepción anula desde la CAJA un abono suyo de hoy.
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API), que ya
 * trae una cuenta de recepción y otra de administración:
 *   - la administradora crea por la API dos pacientes con plan y registra un
 *     abono en el segundo (abono de OTRO usuario para recepción);
 *   - recepción inicia sesión en la web y registra por la API un abono propio
 *     en el primero (hoy, suyo: anulable);
 *   - en /caja, «Anular» solo aparece en el abono propio; el modal dice qué
 *     abono es, exige motivo y, al anular, la fila sale de la caja;
 *   - en la ficha, recepción no ve las pestañas clínicas ni «Insufficient
 *     role», y el estado de cuenta lista el abono como «Anulado por …».
 * Se ejecuta en escritorio (1440px) y en móvil (390px, sin scroll horizontal).
 *
 * Requiere la API con la demo sembrada y la web (ver `playwright.config.ts`).
 * Credenciales y subdominio por entorno, con los valores del seed por defecto.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const REASON = 'Abono registrado en el paciente equivocado';

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

async function accessTokenOf(page: Page): Promise<string> {
  const authRaw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
  return (
    (JSON.parse(authRaw as string) as { state?: { accessToken?: string | null } }).state
      ?.accessToken ?? ''
  );
}

function apiAs(request: APIRequestContext, origin: string, accessToken?: string) {
  const headers: Record<string, string> = { 'X-Tenant-Host': new URL(origin).host };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  };
}

/** Paciente con plan (lo crea ADMIN: el plan es dato clínico). */
async function patientWithPlan(
  post: ReturnType<typeof apiAs>,
  lastName: string,
  docNumber: string,
): Promise<{ patientId: string; planId: string }> {
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Caja',
    lastName,
    docType: 'CC',
    docNumber,
    sex: 'F',
  });
  const plan = await post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  return { patientId: patient.id, planId: plan.id };
}

function payment(amount: number) {
  return { amount, currency: 'COP', paidAt: new Date().toISOString(), method: 'CASH' };
}

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`recepción anula desde la caja su abono de hoy, con motivo (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const tag = `${suffix}${viewport.width}`;
    const ownName = `Propio${tag}`;
    const otherName = `Ajeno${tag}`;

    // --- Datos: la administradora crea pacientes y planes, y un abono suyo.
    const login = await page.request.post(`${API_URL}/auth/login`, {
      headers: { 'X-Tenant-Host': new URL(origin).host },
      data: { email: ADMIN_EMAIL, password: DEMO_PASSWORD },
    });
    expect(login.ok(), `login admin falló: ${await login.text()}`).toBeTruthy();
    const adminPost = apiAs(
      page.request,
      origin,
      ((await login.json()) as { accessToken: string }).accessToken,
    );
    const own = await patientWithPlan(adminPost, ownName, `DX57P${tag}`.slice(0, 20));
    const other = await patientWithPlan(adminPost, otherName, `DX57A${tag}`.slice(0, 20));
    await adminPost(`/treatment-plans/${other.planId}/payments`, payment(57_000));

    // --- Recepción inicia sesión en la web y registra su abono de hoy.
    await page.goto(`${origin}/login`);
    await page.getByLabel('Correo electrónico').fill(RECEPTION_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect
      .poll(async () => Boolean(await accessTokenOf(page).catch(() => '')), { timeout: 15_000 })
      .toBe(true);
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
    const receptionPost = apiAs(page.request, origin, await accessTokenOf(page));
    await receptionPost(`/treatment-plans/${own.planId}/payments`, payment(12_345));

    // --- Caja: «Anular» solo en el abono propio.
    await page.goto(`${origin}/caja`);
    const table = page.getByRole('table', { name: 'Abonos del período' });
    await expect(table).toBeVisible({ timeout: 15_000 });
    const ownRow = table.getByRole('row').filter({ hasText: ownName });
    const otherRow = table.getByRole('row').filter({ hasText: otherName });
    await expect(ownRow).toHaveCount(1);
    await expect(otherRow).toHaveCount(1);
    await expect(otherRow.getByRole('button', { name: /anular/i })).toHaveCount(0);

    await ownRow.getByRole('button', { name: `Anular abono de Caja ${ownName}` }).click();
    const dialog = page.getByRole('dialog', { name: '¿Anular este abono?' });
    await expect(dialog).toBeVisible();
    // Qué abono es y la regla de recepción, en español.
    await expect(dialog).toContainText(`Caja ${ownName}`);
    await expect(dialog).toContainText('12.345');
    await expect(dialog).toContainText('solo los que registraste tú hoy');

    // Sin motivo: no anula y lo explica junto al campo.
    const reason = dialog.getByLabel('Motivo de la anulación');
    await dialog.getByRole('button', { name: 'Anular abono' }).click();
    await expect(dialog.getByRole('alert')).toContainText('al menos 3 caracteres');
    await expect(reason).toHaveAttribute('aria-invalid', 'true');

    await reason.fill(REASON);
    await dialog.getByRole('button', { name: 'Anular abono' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Abono anulado' })).toBeVisible();
    // La caja se recarga: el abono anulado deja de contar y de listarse.
    await expect(ownRow).toHaveCount(0, { timeout: 10_000 });
    await expect(otherRow).toHaveCount(1);

    if (viewport.width === 390) {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }

    // --- Ficha: sin pestañas clínicas ni «Insufficient role»; un enlace a
    // «Plan de tratamiento» cae en «Datos».
    await page.goto(`${origin}/patients/${own.patientId}?tab=treatment-plans`);
    const tabs = page.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: 'Datos' })).toBeVisible({ timeout: 15_000 });
    await expect(tabs.getByRole('tab', { name: 'Datos' })).toHaveAttribute('aria-selected', 'true');
    for (const clinical of ['Plan de tratamiento', 'Historia clínica', 'Odontograma']) {
      await expect(tabs.getByRole('tab', { name: clinical })).toHaveCount(0);
    }
    await expect(page.getByText('Insufficient role')).toHaveCount(0);

    // --- Estado de cuenta: el abono anulado, con autor y motivo.
    await tabs.getByRole('tab', { name: 'Estado de cuenta' }).click();
    const movements = page
      .locator('#tabpanel-account-statement')
      .getByRole('table', { name: 'Movimientos (abonos)' });
    await expect(movements).toContainText(`: ${REASON}`, { timeout: 10_000 });
    await expect(movements.getByRole('button', { name: /anular/i })).toHaveCount(0);
    await expect(page.getByText('Insufficient role')).toHaveCount(0);
  });
}
