import { randomUUID } from 'node:crypto';
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
 * e2e DX-567 — «Reportes» → «Previsión» y la tira «Agendado» de la agenda, sin
 * mocks, en una clínica nueva (una sede en USD, catálogo en USD):
 *  - ADMIN, mañana 10:00: una cita con dos ítems aceptados de 40 y 60 → 100
 *    en ese día y en su profesional.
 *  - ADMIN, mañana 11:00: una cita sin ítems (sale en «sin tratamiento ligado»).
 *  - ADMIN, mañana 12:00: una cita con un ítem de 60, CANCELADA → no suma.
 *  - DENTIST, pasado mañana 10:00: una cita con un ítem de 40.
 *  1. 1440 px ADMIN: fórmula de la previsión, 100 en el día y en el
 *     profesional, la cita sin tratamiento y su enlace abre la cita en la agenda,
 *     donde la tira «Agendado» enseña los 100.
 *  2. DENTIST: solo lo suyo (40), sin filtro de profesional.
 *  3. RECEPTION: no ve la tira ni pide el endpoint.
 *  4. 390 px: Reportes y agenda sin scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const subdomain = `test-prevision-${suffix}`;
const password = 'Password123!';
const admin = { fullName: 'Dra. Previsión Titular', email: `prevision.${suffix}@example.com` };
const dentist = { fullName: 'Dr. Previsión Odontólogo', email: `prevision.od.${suffix}@example.com` };
const reception = { fullName: 'Recepción Previsión', email: `prevision.rec.${suffix}@example.com` };
const LAST = `Prevision${suffix}`;
const fmt = regionalFormat(E2E_REGION);
const money = (amount: number) => moneyWithCode(amount, 'USD', fmt);
const MIN = 60_000;
const TOMORROW = sedeDayFromToday(1);
const AFTER = sedeDayFromToday(2);
const REPORT_URL = `/reportes?tab=prevision&periodo=custom&desde=${TOMORROW}&hasta=${AFTER}`;

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let unlinked: { appointmentId: string; name: string };

async function patientWithPlan(
  request: APIRequestContext,
  s: ApiSession,
  firstName: string,
  catalogIds: string[],
): Promise<{ patientId: string; items: string[] }> {
  const patient = await apiPost<{ id: string }>(request, s, '/patients', {
    firstName,
    lastName: LAST,
    docType: 'NATIONAL_ID',
    docNumber: `PRV${firstName.slice(0, 3)}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  if (catalogIds.length === 0) return { patientId: patient.id, items: [] };
  const plan = await apiPost<{ id: string }>(request, s, `/patients/${patient.id}/treatment-plans`, { currency: 'USD' });
  const items: string[] = [];
  for (const [i, catalogItemId] of catalogIds.entries()) {
    items.push(
      (await apiPost<{ id: string }>(request, s, `/treatment-plans/${plan.id}/items`, { toothNumber: String(11 + i), catalogItemId })).id,
    );
  }
  await apiPost(request, s, `/treatment-plans/${plan.id}/present`, {});
  const accepted = await request.patch(`${API_URL}/treatment-plans/${plan.id}`, {
    headers: s.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accepted.ok(), `aceptar ${plan.id}: ${await accepted.text()}`).toBeTruthy();
  return { patientId: patient.id, items };
}

async function appointmentAt(
  request: APIRequestContext,
  s: ApiSession,
  patientId: string,
  providerId: string,
  day: string,
  hhmm: string,
  planItemIds: string[],
): Promise<string> {
  const start = atSede(day, hhmm);
  return (
    await apiPost<{ id: string }>(request, s, '/appointments', {
      patientId,
      providerId,
      start: start.toISOString(),
      end: new Date(start.getTime() + 30 * MIN).toISOString(),
      ...(planItemIds.length > 0 ? { planItemIds } : {}),
    })
  ).id;
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clinica Prevision ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const dentistSession = await apiLogin(request, session.origin, dentist.email, password);
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  const adminId = staff.find((m) => m.fullName === admin.fullName)!.userId;
  const dentistId = staff.find((m) => m.fullName === dentist.fullName)!.userId;

  const catalog: Record<number, string> = {};
  for (const price of [40, 60]) {
    catalog[price] = (
      await apiPost<{ id: string }>(request, session, '/catalog/items', {
        code: `PRV${price}-${suffix}`,
        kind: 'PROCEDURE',
        labelEs: `Procedimiento ${price} ${suffix}`,
        color: '#3366CC',
        defaultPrice: price,
      })
    ).id;
  }

  // Mañana 10:00: 40 + 60 = 100 para la ADMIN.
  const ana = await patientWithPlan(request, session, 'Ana', [catalog[40], catalog[60]]);
  await appointmentAt(request, session, ana.patientId, adminId, TOMORROW, '10:00', ana.items);

  // Mañana 11:00: sin tratamiento ligado.
  const bea = await patientWithPlan(request, session, 'Beatriz', []);
  unlinked = {
    appointmentId: await appointmentAt(request, session, bea.patientId, adminId, TOMORROW, '11:00', []),
    name: `Beatriz ${LAST}`,
  };

  // Mañana 12:00: 60, cancelada → no suma.
  const car = await patientWithPlan(request, session, 'Carmen', [catalog[60]]);
  const cancelled = await appointmentAt(request, session, car.patientId, adminId, TOMORROW, '12:00', car.items);
  const cancel = await request.patch(`${API_URL}/appointments/${cancelled}`, {
    headers: session.headers,
    data: { status: 'CANCELLED', cancelledByKind: 'CLINIC', cancelReasonCode: 'CLINIC_RESCHEDULE' },
  });
  expect(cancel.ok(), `cancelar: ${await cancel.text()}`).toBeTruthy();

  // Pasado mañana 10:00: 40 para el DENTIST.
  const dan = await patientWithPlan(request, dentistSession, 'Daniela', [catalog[40]]);
  await appointmentAt(request, dentistSession, dan.patientId, dentistId, AFTER, '10:00', dan.items);
});

async function openTab(page: Page, email = admin.email): Promise<void> {
  await loginAs(page, session.origin, email, password);
  await page.goto(`${session.origin}${REPORT_URL}`);
  await expect(page.getByRole('tab', { name: 'Previsión', selected: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('scheduled-production-forecast')).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`dx567-${name}.png`), fullPage: true, animations: 'disabled' });
}

const dayLabel = (day: string) => fmt.civilLongDate(day, { year: false });

test('1440 px ADMIN: fórmula, 100 en el día y el profesional, la cita sin tratamiento abre la agenda con la tira', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTab(page);
  await expect(page.getByTestId('scheduled-production-formula')).toHaveText(
    'Producido hasta hoy + Agendado pendiente = Previsión',
  );
  // 100 (ADMIN, mañana) + 40 (DENTIST, pasado mañana); la cancelada no suma.
  await expect(page.getByTestId('scheduled-production-total')).toContainText(money(140));
  await expect(page.getByTestId('scheduled-production-appointments')).toContainText('3');
  await expect(page.getByTestId('scheduled-production-without-items')).toContainText('1');
  const byDay = page.getByRole('table', { name: 'Agendado por día' });
  await expect(byDay.getByRole('row').filter({ hasText: dayLabel(TOMORROW) })).toContainText(money(100));
  await expect(byDay.getByRole('row').filter({ hasText: dayLabel(AFTER) })).toContainText(money(40));
  const byPro = page.getByRole('table', { name: 'Agendado por profesional' });
  await expect(byPro.getByRole('row').filter({ hasText: admin.fullName })).toContainText(money(100));
  await expect(byPro.getByRole('row').filter({ hasText: dentist.fullName })).toContainText(money(40));
  await expect(page.getByLabel('Profesional de la cita', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'admin-1440');

  // La cita sin tratamiento: enlace a la cita en la agenda.
  const list = page.getByTestId('scheduled-production-unlinked');
  const open = list.getByRole('link', { name: `Abrir la cita de ${unlinked.name} en la agenda`, exact: true });
  await expect(open).toHaveAttribute('href', `/agenda?cita=${unlinked.appointmentId}`);
  await open.click();
  await expect(page).toHaveURL(/\/agenda$/, { timeout: 30_000 });
  const detail = page.getByRole('dialog').filter({ hasText: unlinked.name });
  await expect(detail).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // La agenda quedó en el Día de la cita: la tira, con los 100 de la ADMIN.
  const strip = page.getByTestId('agenda-scheduled-strip');
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(strip.getByTestId('agenda-scheduled-row').filter({ hasText: admin.fullName })).toContainText(money(100));
  await expect(strip.getByRole('link', { name: '1 sin tratamiento ligado · ver en Reportes', exact: true })).toHaveAttribute(
    'href',
    new RegExp(`tab=prevision&periodo=custom&desde=${TOMORROW}&hasta=${TOMORROW}`),
  );
  await expectNoHorizontalScroll(page);
  await shot(page, 'agenda-1440');
});

test('DENTIST: solo lo suyo, sin filtro de profesional', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTab(page, dentist.email);
  await expect(page.getByTestId('scheduled-production-scope')).toContainText('Solo lo tuyo');
  await expect(page.getByTestId('scheduled-production-total')).toContainText(money(40));
  await expect(page.getByLabel('Profesional de la cita', { exact: true })).toHaveCount(0);
  const byPro = page.getByRole('table', { name: 'Agendado por profesional' });
  await expect(byPro.getByRole('row').filter({ hasText: dentist.fullName })).toContainText(money(40));
  await expect(byPro.getByRole('row').filter({ hasText: admin.fullName })).toHaveCount(0);
  await shot(page, 'dentist-1440');
});

test('RECEPTION: la agenda sin la tira y sin pedir lo agendado', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const asked: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/reports/scheduled-production')) asked.push(req.url());
  });
  await loginAs(page, session.origin, reception.email, password);
  await page.goto(`${session.origin}/agenda?cita=${unlinked.appointmentId}`);
  const detail = page.getByRole('dialog').filter({ hasText: unlinked.name });
  await expect(detail).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Día', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.getByLabel(/agenda de la semana/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('agenda-scheduled-strip')).toHaveCount(0);
  expect(asked).toEqual([]);
});

test('390 px ADMIN: Reportes y la agenda sin scroll horizontal', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTab(page);
  await expect(page.getByTestId('scheduled-production-unlinked')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shot(page, 'admin-390');

  await page.goto(`${session.origin}/agenda?cita=${unlinked.appointmentId}`);
  const detail = page.getByRole('dialog').filter({ hasText: unlinked.name });
  await expect(detail).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('agenda-scheduled-strip')).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  await shot(page, 'agenda-390');
});
