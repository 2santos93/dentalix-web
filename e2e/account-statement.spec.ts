import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { openPatientTab } from './support/patient-tabs';
import { dataList, dataListRows } from './support/data-list';
import { E2E_REGION } from './support/regional';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

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
const API = API_URL;

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Clinica Estado Cuenta ${suffix}`;
const subdomain = `test-clinic-ec-${suffix}`;
const email = `test.user.estadocuenta.${suffix}@example.com`;
const password = 'Password123!';
const patientFirstName = 'Rosa';
const patientLastName = `EstadoCuenta${suffix}`;

/** DX-522: el estado de cuenta en pantalla, con el formato de la sede y el código ISO («USD 1.000,00»). */
const sedeFmt = regionalFormat(E2E_REGION);
const sedeUsd = (amount: number): string => moneyWithCode(amount, 'USD', sedeFmt);

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
    docType: 'NATIONAL_ID',
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
  const accessToken = await accessTokenOf(page);
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

  await openPatientTab(page, 'Estado de cuenta');
  await expect(page).toHaveURL(/tab=account-statement/);

  const panel = page.locator('#tabpanel-account-statement');
  const summary = panel.getByRole('region', { name: 'Resumen en USD' });
  await expect(summary).toBeVisible({ timeout: 10_000 });
  await expect(summary.getByTestId('budgeted')).toContainText(sedeUsd(1000));
  await expect(summary.getByTestId('paid')).toContainText(sedeUsd(300));
  await expect(summary.getByTestId('balance')).toContainText(sedeUsd(700));

  // UX v2: tabla desde 640 px, tarjetas en el teléfono (`DataList`). Dos abonos.
  const movements = dataList(panel, 'Movimientos (abonos)');
  await expect(dataListRows(movements).filter({ hasText: /\d{2}\/\d{2}\/\d{4}/ })).toHaveCount(2);
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
    sedeUsd(700),
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

  // DX-047 — papel A4: un documento corto sale en UNA hoja (sin hoja en blanco
  // final) y ninguna tabla ni celda se recorta a lo ancho. Un estado de cuenta
  // largo no se siembra aquí (exigiría decenas de abonos por la API); el salto
  // en blanco tenía causa en el CSS (`page` en un elemento interior), no en la
  // cantidad de filas, y queda cubierto con el caso corto.
  const pdf = await printPage.pdf({ format: 'A4', preferCSSPageSize: true });
  const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  expect(pageCount).toBe(1);

  await printPage.setViewportSize({ width: 794, height: 1123 });
  const clipped = await printPage.evaluate(() =>
    Array.from(
      document.querySelectorAll('.statement-print-root table, .statement-print-root :is(th, td)'),
    )
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.tagName}:${(el.textContent ?? '').slice(0, 30)}`),
  );
  expect(clipped).toEqual([]);
});
