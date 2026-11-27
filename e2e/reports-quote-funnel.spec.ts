import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e DX-558 — «Reportes» → «Presupuestos» (embudo), sin mocks, en una clínica
 * nueva (una sede en USD, catálogo en USD). Hoy se presentan 10 presupuestos
 * (11 planes: uno es un A/B):
 *  - ADMIN: P1 aceptado (100) con su ítem en una cita; P2 aceptado (200) y
 *    realizado; P4 aceptado EN PARTE (100 de 100 + 300; el pendiente no es
 *    otra presentación); P5 A/B pendiente (A 300, B 300 + 100 → cuenta una
 *    vez, por 400); P6 rechazado por precio (100); P8 rechazado por precio (200).
 *  - DENTIST: P3 aceptado (100) con un abono de 50; P7 rechazado por miedo
 *    (100); P9 y P10 pendientes (100 cada uno).
 * Presentados 10 por 1 800; aceptados 4 (40 %) por 500 (27,8 %); agendados 2
 * (P1 por la cita, P2 por realizado); realizados 1; cobrados 1 (50).
 * Pendientes 3, rechazados 3 (precio 2, miedo 1).
 *  1. 1440 px ADMIN: pasos, tasas, A/B una vez, motivos, detalle con enlace
 *     a la ficha (el plan llega elegido) y CSV.
 *  2. 390 px ADMIN: sin scroll horizontal, detalle dentro de la pantalla.
 *  3. DENTIST: solo lo suyo, sin filtro de profesional ni CSV, con su aviso.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const subdomain = `test-embudo-${suffix}`;
const password = 'Password123!';
const admin = { fullName: 'Dra. Embudo Titular', email: `embudo.${suffix}@example.com` };
const dentist = { fullName: 'Dr. Embudo Odontólogo', email: `embudo.od.${suffix}@example.com` };
const LAST = `Embudo${suffix}`;
const fmt = regionalFormat(E2E_REGION);
const money = (amount: number) => moneyWithCode(amount, 'USD', fmt);
const pct = (value: number) => fmt.percent(value, 1);
const MIN = 60_000;
const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const BY_PROFESSIONAL = 'Embudo de presupuestos por profesional';

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let p1: { patientId: string; planId: string; name: string };

/** Presupuestos de una persona (ADMIN o DENTIST): pacientes, planes e ítems por la API. */
function seeder(request: APIRequestContext, s: ApiSession, catalog: Record<number, string>) {
  let n = 0;
  async function plan(firstName: string, prices: number[]) {
    n += 1;
    const patient = await apiPost<{ id: string }>(request, s, '/patients', {
      firstName,
      lastName: LAST,
      docType: 'NATIONAL_ID',
      docNumber: `EMB${firstName.slice(0, 3)}${n}${suffix}`.slice(0, 20),
      sex: 'F',
    });
    const created = await apiPost<{ id: string }>(request, s, `/patients/${patient.id}/treatment-plans`, {
      currency: 'USD',
    });
    const items: string[] = [];
    for (const [i, price] of prices.entries()) {
      items.push(
        (
          await apiPost<{ id: string }>(request, s, `/treatment-plans/${created.id}/items`, {
            toothNumber: String(11 + i),
            catalogItemId: catalog[price],
          })
        ).id,
      );
    }
    return { patientId: patient.id, planId: created.id, items, name: `${firstName} ${LAST}` };
  }
  const present = (planId: string) => apiPost(request, s, `/treatment-plans/${planId}/present`, {});
  async function accept(planId: string) {
    const res = await request.patch(`${API_URL}/treatment-plans/${planId}`, {
      headers: s.headers,
      data: { status: 'ACCEPTED' },
    });
    expect(res.ok(), `aceptar ${planId}: ${await res.text()}`).toBeTruthy();
  }
  const reject = (planId: string, reason: 'PRICE' | 'FEAR') =>
    apiPost(request, s, `/treatment-plans/${planId}/reject`, { reason });
  return { plan, present, accept, reject };
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clinica Embudo ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  // DX-304-bis: sin horario de atención la sede no restringe días. La clínica
  // nueva cierra los domingos y estos specs agendan «mañana»: un sábado daba
  // 422 «La sede no atiende los domingos».
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok(), `horario: ${await schedule.text()}`).toBeTruthy();
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const dentistSession = await apiLogin(request, session.origin, dentist.email, password);
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  const adminId = staff.find((m) => m.fullName === admin.fullName)!.userId;

  const catalog: Record<number, string> = {};
  for (const price of [100, 200, 300]) {
    catalog[price] = (
      await apiPost<{ id: string }>(request, session, '/catalog/items', {
        code: `EMB${price}-${suffix}`,
        kind: 'PROCEDURE',
        labelEs: `Procedimiento ${price} ${suffix}`,
        color: '#3366CC',
        defaultPrice: price,
      })
    ).id;
  }
  const a = seeder(request, session, catalog);
  const d = seeder(request, dentistSession, catalog);

  // P1: aceptado, con su ítem en una cita de mañana (agendado).
  const plan1 = await a.plan('Adriana', [100]);
  await a.present(plan1.planId);
  await a.accept(plan1.planId);
  const tomorrow = atSede(sedeDayFromToday(1), '10:00');
  await apiPost(request, session, '/appointments', {
    patientId: plan1.patientId,
    providerId: adminId,
    start: tomorrow.toISOString(),
    end: new Date(tomorrow.getTime() + 30 * MIN).toISOString(),
    planItemIds: plan1.items,
  });
  p1 = plan1;

  // P2: aceptado y realizado.
  const plan2 = await a.plan('Beatriz', [200]);
  await a.present(plan2.planId);
  await a.accept(plan2.planId);
  const done = await request.patch(`${API_URL}/treatment-plans/${plan2.planId}/items/${plan2.items[0]}`, {
    headers: session.headers,
    data: { status: 'DONE' },
  });
  expect(done.ok(), await done.text()).toBeTruthy();

  // P3 (DENTIST): aceptado, con un abono de 50.
  const plan3 = await d.plan('Carmen', [100]);
  await d.present(plan3.planId);
  await d.accept(plan3.planId);
  await apiPost(request, session, `/treatment-plans/${plan3.planId}/payments`, {
    amount: 50,
    currency: 'USD',
    paidAt: new Date().toISOString(),
    method: 'TRANSFER',
  });

  // P4: aceptado en parte (el de 100; el de 300 queda en un pendiente).
  const plan4 = await a.plan('Daniela', [100, 300]);
  await a.present(plan4.planId);
  const preview = await apiPost<{ accepted: { contentHash: string } }>(
    request,
    session,
    `/patients/${plan4.patientId}/treatment-plans/${plan4.planId}/acceptance/partial-preview`,
    { itemIds: [plan4.items[0]] },
  );
  await apiPost(request, session, `/patients/${plan4.patientId}/treatment-plans/${plan4.planId}/acceptance`, {
    signerName: plan4.name,
    signature: SIGNATURE,
    contentHash: preview.accepted.contentHash,
    partial: { itemIds: [plan4.items[0]] },
  });

  // P5: A/B presentado (A 300; B copia el 300 y suma 100), pendiente.
  const plan5 = await a.plan('Elena', [300]);
  const optionB = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan5.planId}/alternatives`, {});
  await apiPost(request, session, `/treatment-plans/${optionB.id}/items`, { toothNumber: '21', catalogItemId: catalog[100] });
  await a.present(plan5.planId);
  await a.present(optionB.id);

  // P6 y P8: rechazados por precio; P7 (DENTIST): por miedo.
  const plan6 = await a.plan('Fabiola', [100]);
  await a.present(plan6.planId);
  await a.reject(plan6.planId, 'PRICE');
  const plan7 = await d.plan('Gabriela', [100]);
  await d.present(plan7.planId);
  await d.reject(plan7.planId, 'FEAR');
  const plan8 = await a.plan('Helena', [200]);
  await a.present(plan8.planId);
  await a.reject(plan8.planId, 'PRICE');

  // P9 y P10 (DENTIST): pendientes.
  for (const name of ['Irene', 'Julia']) {
    const p = await d.plan(name, [100]);
    await d.present(p.planId);
  }
});

async function openTab(page: Page, email = admin.email): Promise<void> {
  await loginAs(page, session.origin, email, password);
  await page.goto(`${session.origin}/reportes?tab=presupuestos`);
  await expect(page.getByRole('tab', { name: 'Presupuestos', selected: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quote-funnel-step-PRESENTED')).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`dx558-${name}.png`), fullPage: true, animations: 'disabled' });
}

const step = (page: Page, key: string) => page.getByTestId(`quote-funnel-step-${key}`);

test('1440 px ADMIN: pasos, tasas, A/B una vez, motivos y el detalle con enlace a la ficha', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTab(page);
  // 10 presentaciones (11 planes: el A/B cuenta una vez, por su opción mayor, 400).
  await expect(step(page, 'PRESENTED')).toHaveText(`10 · ${pct(100)} · ${money(1800)}`);
  await expect(step(page, 'ACCEPTED')).toHaveText(`4 · ${pct(40)} · ${money(500)}`);
  await expect(step(page, 'SCHEDULED')).toHaveText(`2 · ${pct(20)} · ${money(300)}`);
  await expect(step(page, 'DONE')).toHaveText(`1 · ${pct(10)} · ${money(200)}`);
  await expect(step(page, 'COLLECTED')).toHaveText(`1 · ${pct(10)} · ${money(50)}`);
  await expect(page.getByTestId('quote-funnel-by-count')).toContainText(pct(40));
  await expect(page.getByTestId('quote-funnel-by-amount')).toContainText(pct(27.8));
  await expect(page.getByTestId('quote-funnel-outcome-pending')).toContainText('3');
  await expect(page.getByTestId('quote-funnel-outcome-pending')).toContainText(money(600));
  await expect(page.getByTestId('quote-funnel-outcome-rejected')).toContainText('3');
  await expect(page.getByTestId('quote-funnel-reason-PRICE')).toHaveText(`2 · ${money(300)}`);
  await expect(page.getByTestId('quote-funnel-reason-FEAR')).toHaveText(`1 · ${money(100)}`);
  const reasons = page.getByRole('figure', { name: 'Motivos de rechazo' }).getByTestId('ranked-bar');
  await expect(reasons.first()).toContainText('Precio');
  const table = page.getByRole('table', { name: BY_PROFESSIONAL });
  await expect(table.getByRole('row').filter({ hasText: dentist.fullName })).toBeVisible();
  await expect(table.getByRole('row').filter({ hasText: admin.fullName })).toBeVisible();
  await expect(page.getByLabel('Profesional que lo elaboró', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar CSV' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'admin-1440');

  // Aceptados → sus 4 presentaciones, con el paciente enlazado a su plan.
  await page.getByRole('button', { name: /^Aceptados: 4/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Aceptados' });
  await expect(dialog.getByTestId('quote-funnel-presentation')).toHaveCount(4, { timeout: 30_000 });
  const link = dialog.getByRole('link', { name: p1.name, exact: true });
  await expect(link).toHaveAttribute('href', `/patients/${p1.patientId}?tab=treatment-plans&planId=${p1.planId}`);
  await shot(page, 'detalle-1440');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/patients/${p1.patientId}\\?tab=treatment-plans&planId=${p1.planId}`));
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue(p1.planId, { timeout: 30_000 });
});

test('390 px ADMIN: sin scroll horizontal y el detalle dentro de la pantalla', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTab(page);
  await expect(page.getByRole('table', { name: BY_PROFESSIONAL })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'admin-390');
  await page.getByRole('button', { name: /^Rechazados: 3/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Rechazados' });
  await expect(dialog.getByTestId('quote-funnel-presentation')).toHaveCount(3, { timeout: 30_000 });
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  await shot(page, 'detalle-390');
});

test('DENTIST: solo sus presupuestos, sin filtro de profesional ni CSV', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTab(page, dentist.email);
  await expect(page.getByRole('tab')).toHaveText(['Producción por procedimiento', 'Presupuestos', 'Previsión', 'Profesionales', 'Inasistencias', 'Tiempos']);
  await expect(page.getByTestId('quote-funnel-scope')).toContainText('Solo tus presupuestos');
  await expect(step(page, 'PRESENTED')).toHaveText(`4 · ${pct(100)} · ${money(400)}`);
  await expect(step(page, 'ACCEPTED')).toHaveText(`1 · ${pct(25)} · ${money(100)}`);
  await expect(page.getByLabel('Profesional que lo elaboró', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Descargar CSV' })).toHaveCount(0);
  const table = page.getByRole('table', { name: BY_PROFESSIONAL });
  await expect(table.getByRole('row').filter({ hasText: admin.fullName })).toHaveCount(0);
  await expect(table.getByRole('row').filter({ hasText: dentist.fullName })).toBeVisible();
  await shot(page, 'dentist-1440');
});
