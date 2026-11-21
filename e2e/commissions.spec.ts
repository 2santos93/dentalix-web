import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { E2E_REGION } from './support/regional';
import { atSede, sedeDayFromToday } from './support/clock';
import { shot } from './support/qa-shot';
import { regionalFormat } from '../src/lib/format/regional-format';
import { previousMonthOf } from '../src/lib/commissions/commissions-api';
import type { Locator, Page } from './support/test';

/**
 * e2e (DX-018): honorarios de odontólogos contra la API real.
 *
 * Registra una clínica (su dueña es ADMIN y atiende), siembra por la API un
 * paciente con una endodoncia realizada el mes pasado y un abono de ese mes, y:
 *   - Ajustes › Honorarios: configura «35 % de lo cobrado» a la dueña;
 *   - /honorarios: la vista previa del mes pasado trae la línea del abono con
 *     su paciente, el % y el honorario en USD;
 *   - cierra la liquidación: queda congelada, con el cierre contable hasta el
 *     último día del mes, y la versión imprimible la muestra.
 * Con `E2E_QA_DIR`, capturas a 1440 y 390 px en claro y oscuro.
 */
const API = API_URL;
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-hon-${suffix}`;
const email = `test.user.honorarios.${suffix}@example.com`;
const password = 'Password123!';
const patientLastName = `Honorarios${suffix}`;
const fmt = regionalFormat(E2E_REGION);

const TODAY = sedeDayFromToday(0, E2E_REGION.timeZone);
const LAST_MONTH = previousMonthOf(TODAY);
const DONE_ON = `${LAST_MONTH.from.slice(0, 8)}10`;
const PAID_ON = `${LAST_MONTH.from.slice(0, 8)}12`;

const WIDTHS = [1440, 390] as const;

async function qaShots(page: Page, name: string, prepare: () => Promise<Locator | null>): Promise<void> {
  if (!process.env.E2E_QA_DIR) return;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const target = await prepare();
    if (target) await target.scrollIntoViewIfNeeded();
    await shot(page, name, width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function seed(request: APIRequestContext, origin: string, accessToken: string): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': new URL(origin).host };
  async function call<T>(method: 'post' | 'patch' | 'put', path: string, data: object): Promise<T> {
    const res = await request[method](`${API}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await call<{ id: string }>('post', '/patients', {
    firstName: 'Rosa',
    lastName: patientLastName,
    docType: 'NATIONAL_ID',
    docNumber: `HN${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await call<{ id: string }>('post', '/catalog/items', {
    code: `hon-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Endodoncia-${suffix}`.slice(0, 60),
    category: 'Endodoncia',
    color: '#3366CC',
    defaultPrice: 200,
  });
  const plan = await call<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, { currency: 'USD' });
  const item = await call<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const itemPath = `/treatment-plans/${plan.id}/items/${item.id}`;
  await call('patch', itemPath, { status: 'ACCEPTED' });
  await call('patch', itemPath, { status: 'DONE' });
  // Realizada el mes pasado (el ADMIN corrige la fecha de un ítem ya hecho).
  await call('patch', itemPath, { completedAt: atSede(DONE_ON, '10:00', E2E_REGION.timeZone).toISOString() });
  // DX-018-bis: la corona va al laboratorio (costo 50 USD) y se cobra con
  // tarjeta, cuya pasarela cobra el 3 % a la clínica.
  const lab = await call<{ id: string }>('post', '/dental-labs', { name: `Laboratorio Caracas ${suffix}`.slice(0, 60) });
  const order = await call<{ id: string }>('post', `/patients/${patient.id}/lab-orders`, {
    labId: lab.id,
    description: 'Perno colado',
    toothNumbers: ['11'],
    treatmentPlanItemId: item.id,
  });
  await call('put', `/lab-orders/${order.id}/cost`, { cost: '50', currency: 'USD' });
  const methodsRes = await request.get(`${API}/payment-methods`, { headers });
  const methods = (await methodsRes.json()) as { id: string; legacyMethod: string | null }[];
  const card = methods.find((m) => m.legacyMethod === 'CARD')!;
  await call('put', `/payment-methods/${card.id}/gateway-fee`, { percent: 3 });
  await call('post', `/treatment-plans/${plan.id}/payments`, {
    amount: 200,
    currency: 'USD',
    paidAt: PAID_ON,
    method: 'CARD',
  });
}

test('honorarios: configurar la regla y cerrar la liquidación del mes pasado', async ({ page }) => {
  test.setTimeout(180_000);
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Honorarios ${suffix}`,
    fullName: 'Ana Admin',
    email,
    password,
  });
  await seed(page.request, origin, await accessTokenOf(page));

  // --- Ajustes › Honorarios: «35 % de lo cobrado» ---
  await page.goto(`${origin}/settings/honorarios`);
  const table = page.getByRole('table', { name: 'Honorarios por profesional' });
  await expect(table).toBeVisible({ timeout: 15_000 });
  await expect(table).toContainText('Sin regla');
  await qaShots(page, 'honorarios-ajustes', async () => page.getByRole('heading', { level: 1, name: 'Honorarios' }));
  await table.getByRole('button', { name: /^Acciones de Ana Admin/ }).click();
  await page.getByRole('menuitem', { name: 'Configurar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Honorarios de Ana Admin' });
  await dialog.getByRole('textbox', { name: 'Porcentaje general' }).fill('35');
  // DX-018-bis: base = 200 − laboratorio 50 − pasarela 3 % (6) = 144 → 35 % = 50,40.
  await dialog.getByRole('switch', { name: 'Descontar el costo de laboratorio' }).click();
  await dialog.getByRole('switch', { name: 'Descontar la comisión de la pasarela de pago' }).click();
  await qaShots(page, 'honorarios-regla', async () => dialog.getByRole('textbox', { name: 'Porcentaje general' }));
  await dialog.getByRole('button', { name: 'Guardar regla' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(table).toContainText('35 % de lo cobrado, por prestación');
  await expect(table).toContainText('descuenta laboratorio y pasarela');

  // --- /honorarios: vista previa del mes pasado ---
  await page.goto(`${origin}/honorarios`);
  const detail = page.getByRole('table', { name: 'Detalle devengado por paciente, procedimiento y abono' });
  await expect(detail).toBeVisible({ timeout: 15_000 });
  await expect(detail).toContainText(`Rosa ${patientLastName}`);
  await expect(detail).toContainText('35 %');
  const totals = page.getByRole('region', { name: 'Totales por moneda' });
  await expect(totals).toContainText('A pagar en USD');
  await expect(totals).toContainText('50,40');
  await expect(detail).toContainText('Antes de descuentos');
  await expect(detail).toContainText('Pasarela 3');
  await qaShots(page, 'honorarios-vista-previa', async () => page.getByRole('heading', { name: 'Vista previa' }));
  await qaShots(page, 'honorarios-detalle', async () => page.getByRole('heading', { name: 'Devengado en el período' }));

  // --- Cerrar: congelada y con el cierre contable hasta fin de mes ---
  await page.getByRole('button', { name: 'Cerrar liquidación' }).click();
  const confirm = page.getByRole('dialog', { name: 'Cerrar la liquidación' });
  await expect(confirm).toContainText(`cerrado hasta el ${fmt.civilDate(LAST_MONTH.to)}`);
  await qaShots(page, 'honorarios-cerrar', async () => confirm);
  await confirm.getByRole('button', { name: 'Cerrar y congelar' }).click();
  await expect(page).toHaveURL(/\/honorarios\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Liquidación de Ana Admin' })).toBeVisible();
  await expect(page.getByText(`Cerrado hasta el ${fmt.civilDate(LAST_MONTH.to)}`)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Detalle devengado por paciente, procedimiento y abono' })).toContainText(
    `Rosa ${patientLastName}`,
  );
  await qaShots(page, 'honorarios-liquidacion', async () => page.getByRole('heading', { level: 1 }));

  // --- Versión imprimible ---
  const settlementId = new URL(page.url()).pathname.split('/').pop()!;
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto(`${origin}/print/commission-settlements/${settlementId}`);
  await expect(page.getByRole('heading', { name: 'Liquidación de honorarios' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('rowheader', { name: 'USD' })).toBeVisible();
  await qaShots(page, 'honorarios-imprimible', async () => page.getByRole('heading', { name: 'Liquidación de honorarios' }));

  // --- La vista previa ya no repite lo liquidado y propone el mes siguiente ---
  await page.goto(`${origin}/honorarios`);
  await expect(page.getByRole('link', { name: new RegExp(LAST_MONTH.from.slice(0, 4)) }).first()).toBeVisible({
    timeout: 15_000,
  });
});
