import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogin } from './support/auth';

/**
 * e2e (DX-011): abrir la ficha → pestaña «Estado de cuenta» → «Imprimir».
 *
 * Registra una clínica (su dueño es ADMIN, que puede leer pagos), siembra por
 * la API real un paciente con un plan aceptado de 1.000 USD, un abono de 300 y
 * otro de 100 anulado, y comprueba:
 *   - la pestaña muestra presupuestado / abonado / saldo cuadrando (el anulado
 *     no suma) y lista el anulado marcado;
 *   - «Imprimir» abre la vista imprimible en otra pestaña con la cabecera de la
 *     clínica, los datos del paciente y el detalle;
 *   - con `media: print`, la barra de acciones desaparece: solo queda el
 *     documento.
 *
 * Requiere los dos servidores (ver `playwright.config.ts`): API en :3000 y web
 * en :3001. Toda la navegación va sobre el origen del tenant que devuelve
 * `registerAndLogin`; las llamadas de siembra son `page.request` directas, así
 * que mandan `X-Tenant-Host` ellas mismas (mismo patrón que
 * `treatment-plans.spec.ts`).
 */
const API = 'http://localhost:3000/api/v1';

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Clinica Estado Cuenta ${suffix}`;
const subdomain = `test-clinic-ec-${suffix}`;
const email = `test.user.estadocuenta.${suffix}@example.com`;
const password = 'Password123!';
const patientFirstName = 'Rosa';
const patientLastName = `EstadoCuenta${suffix}`;

// Mismo formateador que la app (`formatCurrency`, locale `es`).
const usd = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' });
function money(amount: number): string {
  return usd.format(amount);
}

async function seed(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }

  const patient = await post<{ id: string }>('/patients', {
    firstName: patientFirstName,
    lastName: patientLastName,
    docType: 'CC',
    docNumber: `EC${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await post<{ id: string }>('/catalog/items', {
    code: `ec-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Corona-${suffix}`,
    color: '#3366CC',
    defaultPrice: 1000,
  });
  const plan = await post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await post<{ id: string }>(`/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const accept = await request.patch(`${API}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok(), `Aceptar el ítem falló: ${await accept.text()}`).toBeTruthy();

  await post('/treatment-plans/' + plan.id + '/payments', {
    amount: 300,
    currency: 'USD',
    paidAt: '2026-09-01T00:00:00.000Z',
    method: 'CASH',
  });
  const voided = await post<{ id: string }>(`/treatment-plans/${plan.id}/payments`, {
    amount: 100,
    currency: 'USD',
    paidAt: '2026-09-02T00:00:00.000Z',
    method: 'CARD',
  });
  const voidRes = await request.delete(`${API}/payments/${voided.id}`, {
    headers,
    data: { reason: 'Cobro duplicado' },
  });
  expect(voidRes.ok(), `Anular el abono falló: ${await voidRes.text()}`).toBeTruthy();

  return patient.id;
}

test('estado de cuenta: ficha → pestaña → imprimir muestra un documento limpio', async ({
  page,
  context,
}) => {
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName,
    fullName: 'Test User',
    email,
    password,
  });
  const authRaw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
  const accessToken =
    (JSON.parse(authRaw as string) as { state?: { accessToken?: string | null } }).state
      ?.accessToken ?? '';
  expect(accessToken).toBeTruthy();

  const patientId = await seed(page.request, origin, accessToken);

  // La vista imprimible abre el diálogo de impresión al cargar: en el test se
  // neutraliza en TODAS las páginas del contexto (incluida la pestaña nueva).
  await context.addInitScript(() => {
    window.print = () => undefined;
  });

  // --- Ficha → «Estado de cuenta» ---
  await page.goto(`${origin}/patients/${patientId}`);
  await expect(
    page.getByRole('heading', { name: `${patientFirstName} ${patientLastName}` }),
  ).toBeVisible({ timeout: 10_000 });

  const tab = page.getByRole('tab', { name: 'Estado de cuenta' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=account-statement/);

  const panel = page.locator('#tabpanel-account-statement');
  const summary = panel.getByRole('region', { name: 'Resumen en USD' });
  await expect(summary).toBeVisible({ timeout: 10_000 });
  await expect(summary.getByTestId('budgeted')).toContainText(money(1000));
  await expect(summary.getByTestId('paid')).toContainText(money(300));
  await expect(summary.getByTestId('balance')).toContainText(money(700));

  const movements = panel.getByRole('table', { name: 'Movimientos (abonos)' });
  await expect(movements.getByRole('row')).toHaveCount(3);
  await expect(movements).toContainText('Anulado por Test User: Cobro duplicado');

  // --- «Imprimir» → vista imprimible en otra pestaña ---
  const [printPage] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('link', { name: /Imprimir/ }).click(),
  ]);
  await printPage.waitForLoadState();
  await expect(printPage).toHaveURL(new RegExp(`/print/patients/${patientId}/account-statement$`));

  await expect(
    printPage.getByRole('heading', { level: 1, name: 'Estado de cuenta' }),
  ).toBeVisible({ timeout: 10_000 });
  const header = printPage.getByTestId('statement-header');
  await expect(header).toContainText(clinicName);
  await expect(header).toContainText('Fecha de emisión');
  await expect(printPage.getByText(`${patientFirstName} ${patientLastName}`)).toBeVisible();
  await expect(printPage.getByRole('table', { name: 'Resumen por moneda' })).toContainText(
    money(700),
  );

  // Sin el shell de la app: ni raíl ni pestañas de la ficha.
  await expect(printPage.getByRole('tablist')).toHaveCount(0);
  await expect(printPage.getByRole('navigation')).toHaveCount(0);

  // En impresión, la barra de acciones desaparece y el documento sigue ahí.
  const toolbar = printPage.getByRole('toolbar', { name: 'Acciones del documento' });
  await expect(toolbar).toBeVisible();
  await printPage.emulateMedia({ media: 'print' });
  await expect(toolbar).toBeHidden();
  await expect(printPage.getByRole('heading', { level: 1, name: 'Estado de cuenta' })).toBeVisible();
});
