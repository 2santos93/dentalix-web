import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeInBothThemes } from './support/axe';
import { DAY_MS, SEDE_TZ } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { civilDateInZone } from '../src/lib/format/date';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-399-quater-bis): la web enseña lo que cubre el saldo recibido por
 * traspaso, a 1440 y 390 px. La secuencia es la de DX-399-quater, sembrada por
 * la API real en una clínica nueva (sede en USD):
 *   - plan P: un ítem de 70 y un abono de 100, así que quedan 30 propios a cuenta;
 *   - plan Q del mismo paciente: un ítem de 20 y un abono de 50 (30 a cuenta),
 *     que traspasa 30 a P;
 *   - un ítem nuevo de 60 en P, aceptado.
 * El ítem de 60 sale pagado (30 del abono + 30 recibidos) y lo dice en tres
 * sitios: la pestaña Plan, el «Ver por ítem» del estado de cuenta y «Ver
 * imputación» (con la nota de que imputar ahí desplaza ese saldo). El de 70,
 * cubierto solo por el abono, no lleva ninguna línea de traspaso; y como no
 * queda nada recibido a cuenta, tampoco sale la fila «Saldo recibido por
 * traspaso, a cuenta». Requiere los dos servidores.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const password = 'Password123!';
const admin = { fullName: 'Ada Admin', email: `ada.tin399.${suffix}@example.com` };
const fmt = regionalFormat(E2E_REGION);
const money = (amount: number) => moneyWithCode(amount, 'USD', fmt);
const PAID_DAY = civilDateInZone(new Date(Date.now() - 3 * DAY_MS), SEDE_TZ) ?? '';
const origin = tenantOrigin(`test-clinic-tin399-${suffix}`);
const ITEMS_LIST = 'Ítems a los que se imputó el abono';
const NOTE = 'Si imputas este abono aquí, ese saldo vuelve a quedar a cuenta del plan.';

/** Los nombres del catálogo: el ítem cubierto por traspaso y el que solo cubre el abono. */
const names = { covered: `Corona tin${suffix}`, own: `Resina tin${suffix}`, other: `Limpieza tin${suffix}` };
const ids = { patient: '', planP: '' };

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

async function catalogItem(request: Parameters<typeof apiPost>[0], code: string, labelEs: string, price: number) {
  return (
    await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `${code}-${suffix}`,
      kind: 'PROCEDURE',
      labelEs,
      color: '#3366CC',
      defaultPrice: price,
    })
  ).id;
}

async function acceptedItem(
  request: Parameters<typeof apiPost>[0],
  planId: string,
  catalogItemId: string,
  toothNumber: string,
  price: number,
) {
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${planId}/items`, {
    toothNumber,
    catalogItemId,
    price,
  });
  const res = await request.patch(`${API_URL}/treatment-plans/${planId}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(res.ok(), `aceptar el ítem falló: ${await res.text()}`).toBeTruthy();
}

const pay = (request: Parameters<typeof apiPost>[0], planId: string, amount: number) =>
  apiPost<{ id: string }>(request, session, `/treatment-plans/${planId}/payments`, {
    amount,
    currency: 'USD',
    paidAt: PAID_DAY,
    method: 'TRANSFER',
  });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain: `test-clinic-tin399-${suffix}`,
    clinicName: `Clinica Traspaso 399 ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  ids.patient = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Rita',
      lastName: `Traspaso${suffix}`,
      docType: 'NATIONAL_ID',
      docNumber: `RT${suffix}`,
      sex: 'F',
    })
  ).id;
  const own = await catalogItem(request, 'tin-own', names.own, 70);
  const covered = await catalogItem(request, 'tin-cov', names.covered, 60);
  const other = await catalogItem(request, 'tin-oth', names.other, 20);
  const newPlan = async () =>
    (await apiPost<{ id: string }>(request, session, `/patients/${ids.patient}/treatment-plans`, { currency: 'USD' }))
      .id;

  // P: ítem de 70 y abono de 100 → 30 propios a cuenta.
  ids.planP = await newPlan();
  await acceptedItem(request, ids.planP, own, '11', 70);
  await pay(request, ids.planP, 100);
  // Q: ítem de 20 y abono de 50 → 30 a cuenta, que traspasa a P.
  const planQ = await newPlan();
  await acceptedItem(request, planQ, other, '21', 20);
  await pay(request, planQ, 50);
  await apiPost(request, session, `/treatment-plans/${planQ}/credit-transfers`, {
    targetPlanId: ids.planP,
    amount: 30,
    currency: 'USD',
  });
  // Ítem nuevo de 60 en P, aceptado: 30 del abono y 30 de lo recibido.
  await acceptedItem(request, ids.planP, covered, '34', 60);
});

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
] as const;

async function openPlanP(page: Page): Promise<Locator> {
  await page.goto(`${origin}/patients/${ids.patient}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 15_000 });
  await panel.locator('#tp-plan-select').selectOption(ids.planP);
  return panel;
}

/**
 * La fila (escritorio) o la tarjeta (móvil) de un ítem del plan. En el móvil,
 * el `li` más interno con el procedimiento: nunca un `li` contenedor que
 * envuelva la lista entera.
 */
function planItem(panel: Locator, mobile: boolean, procedure: string): Locator {
  return mobile
    ? panel
        .locator('li')
        .filter({ hasText: procedure })
        .filter({ hasNot: panel.page().locator('li') })
        .locator('visible=true')
    : panel
        .getByRole('table', { name: /^Ítems de la visita \d+$/ })
        .getByRole('row')
        .filter({ hasText: procedure });
}

for (const viewport of VIEWPORTS) {
  const mobile = viewport.width < 640;

  test(`pestaña Plan: el ítem de 60 sale pagado con «30 por traspaso» (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    const panel = await openPlanP(page);

    const covered = planItem(panel, mobile, names.covered);
    const line = `De ello, ${money(30)} por traspaso de otro plan`;
    if (mobile) {
      await expect(covered).toContainText(`Cobrado ${money(60)} ·`, { timeout: 15_000 });
      await expect(covered.getByText('Cubierto', { exact: true })).toBeVisible();
    } else {
      const paid = covered.locator('td[data-label="Cobrado"]');
      await expect(paid).toContainText(money(60), { timeout: 15_000 });
      await expect(paid.getByText(line)).toBeVisible();
      await expect(covered.locator('td[data-label="Pendiente"]')).toHaveText('Cubierto');
    }
    await expect(covered.getByText(line)).toBeVisible();
    // Lo que solo cubre el abono no lleva la línea; sin nada recibido a cuenta, no hay fila de plan.
    await expect(planItem(panel, mobile, names.own)).not.toContainText('por traspaso');
    await expect(panel.getByText('Saldo recibido por traspaso, a cuenta')).toHaveCount(0);

    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, panel);
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
  });

  test(`estado de cuenta: «Ver por ítem» dice lo mismo (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/patients/${ids.patient}?tab=account-statement`);
    const statement = page.locator('#tabpanel-account-statement');
    const toggles = statement.getByRole('button', { name: /^Ver por ítem/ });
    // Un desplegable por plan (P y Q): se abren todos y se busca el ítem.
    await expect(toggles.first()).toBeVisible({ timeout: 15_000 });
    for (const toggle of await toggles.all()) {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    }
    const row = statement
      .locator('table[aria-label="Cobrado por ítem del plan"] tr')
      .filter({ hasText: names.covered });
    const paid = row.locator('td[data-label="Cobrado"]');
    await expect(paid).toContainText(money(60), { timeout: 15_000 });
    await expect(paid.getByText(`De ello, ${money(30)} por traspaso de otro plan`)).toBeVisible();
    await expect(row.locator('td[data-label="Pendiente"]')).toHaveText('Cubierto');
    await expect(
      statement.locator('table[aria-label="Cobrado por ítem del plan"] tr').filter({ hasText: names.own }),
    ).not.toContainText('por traspaso');
    await expect(statement.getByText('Saldo recibido por traspaso, a cuenta')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test(`«Ver imputación»: la marca «30 por traspaso» y la nota (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAs(page, origin, admin.email, password);
    const panel = await openPlanP(page);
    const fold = panel.getByRole('button', { name: /^Abonos registrados\s+\d+ abonos?$/ });
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
    await panel.getByRole('button', { name: /^Acciones de abono/ }).first().click();
    await page.getByRole('menuitem', { name: 'Ver imputación', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Imputación del abono' });
    await expect(dialog.getByText('Automática (más antiguo primero)')).toBeVisible({ timeout: 15_000 });

    const lines = dialog
      .getByRole(mobile ? 'list' : 'table', { name: ITEMS_LIST })
      .getByRole(mobile ? 'listitem' : 'row');
    const covered = lines.filter({ hasText: names.covered });
    await expect(covered).toContainText(money(30));
    await expect(covered.getByText(`${money(30)} por traspaso`, { exact: true })).toBeVisible();
    await expect(lines.filter({ hasText: names.own })).not.toContainText('por traspaso');
    await expect(dialog.getByText(NOTE)).toBeVisible();

    await expectDialogInsideViewport(page, dialog);
    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, dialog);
    expect(violations.light).toEqual([]);
    expect(violations.dark).toEqual([]);
  });
}
