import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AxeResults } from 'axe-core';
import { test, expect, type APIRequestContext, type Page } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e DX-304 — «Reportes» → «Profesionales», «Inasistencias» y «Cartera», sin
 * mocks, en una clínica nueva (una sede, planes en USD):
 *  - la ADMIN realiza hoy un procedimiento de 100 y cobra 100; mañana atiende
 *    una cita (COMPLETED);
 *  - el DENTIST realiza hoy uno de 40 (sin cobrar); mañana un paciente suyo no
 *    viene (NO_SHOW).
 *  1. 1440 px ADMIN: una fila por profesional con su producción; el no-show
 *     % (1 de 2 = 50 %) y la cita no asistida con su enlace a la agenda; la
 *     cartera por tramos con los 40 pendientes y su enlace a la cartera.
 *  2. DENTIST: solo su fila y su cita, sin filtro de profesional ni «Cartera».
 *  3. 390 px: las tres pestañas en tarjetas sin scroll horizontal.
 *  4. axe sin violaciones serias en claro y oscuro, a 390 y 1440 px.
 * El período es de ayer a pasado mañana (personalizado): no depende del mes.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const subdomain = `test-profesionales-${suffix}`;
const password = 'Password123!';
const admin = { fullName: 'Dra. Profesionales Titular', email: `profesionales.${suffix}@example.com` };
const dentist = { fullName: 'Dr. Profesionales Odontólogo', email: `profesionales.od.${suffix}@example.com` };
const LAST = `Inasistente${suffix}`;
const fmt = regionalFormat(E2E_REGION);
const money = (amount: number) => moneyWithCode(amount, 'USD', fmt);
const MIN = 60_000;
const TODAY = sedeDayFromToday(0);
const TOMORROW = sedeDayFromToday(1);
const RANGE = `periodo=custom&desde=${sedeDayFromToday(-1)}&hasta=${sedeDayFromToday(2)}`;
const url = (tab: string) => (tab === 'cartera' ? '/reportes?tab=cartera' : `/reportes?tab=${tab}&${RANGE}`);

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let missed: { appointmentId: string; name: string };

async function doneItem(
  request: APIRequestContext,
  s: ApiSession,
  firstName: string,
  price: number,
  paid: boolean,
): Promise<string> {
  const patient = await apiPost<{ id: string }>(request, s, '/patients', {
    firstName,
    lastName: LAST,
    docType: 'NATIONAL_ID',
    docNumber: `PRO${firstName.slice(0, 3)}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `PRO${price}-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Procedimiento ${price} ${suffix}`,
    color: '#3366CC',
    defaultPrice: price,
  });
  const plan = await apiPost<{ id: string }>(request, s, `/patients/${patient.id}/treatment-plans`, { currency: 'USD' });
  const item = await apiPost<{ id: string }>(request, s, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  for (const status of ['ACCEPTED', 'DONE']) {
    const res = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
      headers: s.headers,
      data: { status },
    });
    expect(res.ok(), `ítem ${status}: ${await res.text()}`).toBeTruthy();
  }
  if (paid) {
    await apiPost(request, session, `/treatment-plans/${plan.id}/payments`, {
      amount: price,
      currency: 'USD',
      paidAt: TODAY,
      method: 'CASH',
    });
  }
  return patient.id;
}

async function appointmentTomorrow(
  request: APIRequestContext,
  s: ApiSession,
  patientId: string,
  providerId: string,
  hhmm: string,
  status: 'COMPLETED' | 'NO_SHOW',
): Promise<string> {
  const start = atSede(TOMORROW, hhmm);
  const { id } = await apiPost<{ id: string }>(request, s, '/appointments', {
    patientId,
    providerId,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * MIN).toISOString(),
  });
  const res = await request.patch(`${API_URL}/appointments/${id}`, { headers: s.headers, data: { status } });
  expect(res.ok(), `cita ${status}: ${await res.text()}`).toBeTruthy();
  return id;
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clinica Profesionales ${suffix}`,
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
  const dentistId = staff.find((m) => m.fullName === dentist.fullName)!.userId;

  const ana = await doneItem(request, session, 'Ana', 100, true);
  await appointmentTomorrow(request, session, ana, adminId, '10:00', 'COMPLETED');
  const luis = await doneItem(request, dentistSession, 'Luis', 40, false);
  missed = {
    appointmentId: await appointmentTomorrow(request, session, luis, dentistId, '11:00', 'NO_SHOW'),
    name: `Luis ${LAST}`,
  };
});

async function open(page: Page, tab: string, label: string, email = admin.email): Promise<void> {
  await loginAs(page, session.origin, email, password);
  await page.goto(`${session.origin}${url(tab)}`);
  await expect(page.getByRole('tab', { name: label, selected: true })).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`dx304-${name}.png`), fullPage: true, animations: 'disabled' });
}

test('1440 px ADMIN: profesionales, inasistencias con enlace a la cita y cartera por tramos', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'profesionales', 'Profesionales');
  const table = page.getByRole('table', { name: 'Productividad por profesional' });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.getByRole('row').filter({ hasText: admin.fullName })).toContainText(money(100));
  await expect(table.getByRole('row').filter({ hasText: dentist.fullName })).toContainText(money(40));
  await expect(page.getByTestId('productivity-total-production')).toContainText(money(140));
  await expect(page.getByTestId('productivity-total-collected')).toContainText(money(100));
  await expect(page.getByTestId('productivity-total-no-show')).toContainText(fmt.percent(50, 1));
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  await expectNoHorizontalScroll(page);
  await shot(page, 'profesionales-1440');

  await page.goto(`${session.origin}${url('inasistencias')}`);
  await expect(page.getByTestId('no-shows-rate')).toContainText(fmt.percent(50, 1), { timeout: 30_000 });
  const link = page.getByRole('link', { name: `Abrir la cita de ${missed.name} en la agenda`, exact: true });
  await expect(link).toHaveAttribute('href', `/agenda?cita=${missed.appointmentId}`);
  await expect(page.getByTestId('no-show-kind').first()).toHaveText('No asistió');
  await shot(page, 'inasistencias-1440');

  await page.goto(`${session.origin}${url('cartera')}`);
  await expect(page.getByTestId('aging-total-USD')).toContainText(money(40), { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Ver la cartera con los pacientes' })).toHaveAttribute('href', '/caja/cartera');
  await shot(page, 'cartera-1440');
});

test('DENTIST: solo su fila y su cita, sin filtro de profesional ni «Cartera»', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'profesionales', 'Profesionales', dentist.email);
  const table = page.getByRole('table', { name: 'Productividad por profesional' });
  await expect(table.getByRole('row').filter({ hasText: dentist.fullName })).toContainText(money(40), { timeout: 30_000 });
  await expect(table.getByRole('row').filter({ hasText: admin.fullName })).toHaveCount(0);
  await expect(page.getByLabel('Profesional', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Cartera' })).toHaveCount(0);
  await page.goto(`${session.origin}${url('inasistencias')}`);
  await expect(page.getByTestId('no-shows-scope')).toContainText('Solo tu agenda', { timeout: 30_000 });
  await expect(page.getByRole('link', { name: `Abrir la cita de ${missed.name} en la agenda`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toHaveCount(0);
});

test('390 px ADMIN: las tres pestañas en tarjetas, sin scroll horizontal', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'profesionales', 'Profesionales');
  // A 390 px DataList monta SOLO las tarjetas (`<ul>` con la etiqueta de la lista), no la tabla: el
  // nombre se busca ahí (el primero de `main` es la <option> oculta del filtro de profesional).
  const cards = page.getByRole('list', { name: 'Productividad por profesional' });
  await expect(cards.getByText(admin.fullName)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('table', { name: 'Productividad por profesional' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'profesionales-390');
  await page.goto(`${session.origin}${url('inasistencias')}`);
  await expect(page.getByTestId('no-shows-list')).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'inasistencias-390');
  await page.goto(`${session.origin}${url('cartera')}`);
  await expect(page.getByTestId('aging-total-USD')).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'cartera-390');
});

test('axe: las tres pestañas a 390 y 1440 px, en claro y oscuro', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'profesionales', 'Profesionales');
  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  async function serious() {
    await page.mouse.move(0, 0);
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await page.evaluate(axeSource);
    const results = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: () => Promise<AxeResults> } }).axe;
      return axe.run();
    });
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) }));
  }
  const ready: Record<string, (p: Page) => Promise<void>> = {
    profesionales: (p) =>
      expect(
        p
          .getByRole(p.viewportSize()!.width < 640 ? 'list' : 'table', { name: 'Productividad por profesional' })
          .getByText(admin.fullName),
      ).toBeVisible({ timeout: 30_000 }),
    inasistencias: (p) => expect(p.getByTestId('no-shows-list')).toBeVisible({ timeout: 30_000 }),
    cartera: (p) => expect(p.getByTestId('aging-total-USD')).toBeVisible({ timeout: 30_000 }),
  };
  for (const tab of Object.keys(ready)) {
    for (const width of [390, 1440]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto(`${session.origin}${url(tab)}`);
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
        await ready[tab](page);
        expect.soft(await serious(), `${tab} ${width} ${colorScheme}`).toEqual([]);
      }
    }
  }
});
