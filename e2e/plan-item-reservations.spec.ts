import { test, expect, type Page } from './support/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { LATE_BROWSER_TIME, SEDE_TODAY_TZ, atSede, sedeDayFromToday } from './support/clock';
import { E2E_TODAY_REGION } from './support/regional';
import { expectNoHorizontalScroll } from './support/layout';
import { expectTouchTarget } from './support/touch-targets';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-273 (revisión DX-271, I2): «Llegó» con un tratamiento que sigue
 * reservado en otra cita (la de la semana siguiente).
 *
 * Una clínica nueva por corrida, sin horario, con recepción. Por paciente: un
 * plan aceptado con un implante; la cita A (hoy, que ya empezó: su reserva
 * venció) lo tenía, y recepción lo agendó en la cita B de dentro de 6 días.
 * La API no deja agendar en el pasado, así que A se crea mañana y se mueve a
 * hoy por la BD (E2E_DATABASE_URL, como DX-242; sin ella, salto permitido en
 * e2e/allowed-skips.json). El navegador va a las 23:30 de la sede (DX-252).
 *  1. 1440 px: «Llegó» en la tarjeta → aviso no bloqueante con la fecha de B;
 *     el panel «En clínica» lo repite; «Traer a esta cita» mueve la reserva
 *     (B deja de tenerlo) y el aviso desaparece.
 *  2. 390 px: lo mismo desde la hoja «En clínica», con teclado y sin scroll
 *     horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `reserva-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.res.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.res.${suffix}@example.com` };
const last = `Reserva${suffix}`.slice(0, 40);
const MIN = 60_000;
const DB_SKIP = 'E2E_DATABASE_URL no definido: no se puede mover a hoy la cita que ya empezó';
const NOTICE = 'Tratamiento reservado en otra cita';

/**
 * DX-449: la sede y el navegador van en `SEDE_TODAY_TZ` (Bogotá salvo cerca de
 * su medianoche): las citas «de hoy que ya empezaron» caben antes de «ahora»
 * sin cruzar de día, corra la CI a la hora que corra.
 */
const ZONE = SEDE_TODAY_TZ;
test.use({ timezoneId: ZONE });

let session: ApiSession;
let providerId: string;
let catalogId: string;

interface Scenario {
  name: string;
  arrivedId: string;
  futureId: string;
  itemLabel: string;
  message: string;
}

/** «30/10/2026 a las 09:00» de la sede. */
function wall(at: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('es-CO', {
      timeZone: ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} a las ${p.hour}:${p.minute}`;
}

/**
 * Mueve la cita a hoy, ya empezada (hace 10 o 16 min; cada escenario en su
 * hueco de 5 min, mismo profesional). `ZONE` deja al menos 3 h desde la
 * medianoche: sigue siendo de hoy.
 */
function moveToStartedToday(id: string, slot: number): void {
  const start = new Date(Date.now() - (10 + 6 * slot) * MIN);
  const end = new Date(start.getTime() + 5 * MIN);
  execFileSync('psql', [
    process.env.E2E_DATABASE_URL as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE appointments SET start = '${start.toISOString()}', "end" = '${end.toISOString()}' WHERE id = '${id}'`,
  ]);
}

async function scenario(page: Page, name: string, offsetMin: number): Promise<Scenario> {
  const request = page.request;
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: name,
    lastName: last,
    docType: 'NATIONAL_ID',
    docNumber: `RES${name}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '36',
    catalogItemId: catalogId,
  });
  const accepted = await request.patch(`${API_URL}/treatment-plans/${plan.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accepted.ok(), await accepted.text()).toBeTruthy();
  // A: mañana con el implante; luego, por la BD, hoy y ya empezada.
  const tomorrow = atSede(sedeDayFromToday(1, ZONE), `0${8 + offsetMin}:00`, ZONE);
  const a = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: tomorrow.toISOString(),
    end: new Date(tomorrow.getTime() + 15 * MIN).toISOString(),
    planItemIds: [item.id],
  });
  moveToStartedToday(a.id, offsetMin);
  // B: la semana que viene, con el mismo implante (la reserva de A venció).
  const futureStart = atSede(sedeDayFromToday(6, ZONE), `1${offsetMin}:00`, ZONE);
  const b = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: futureStart.toISOString(),
    end: new Date(futureStart.getTime() + 30 * MIN).toISOString(),
    planItemIds: [item.id],
  });
  return {
    name: `${name} ${last}`,
    arrivedId: a.id,
    futureId: b.id,
    itemLabel: `Implante ${suffix.slice(0, 6)} · diente 36`,
    message: `Este tratamiento está reservado en la cita del ${wall(futureStart)}`,
  };
}

async function futurePlanItems(page: Page, id: string): Promise<string[]> {
  const res = await page.request.get(`${API_URL}/appointments/${id}`, { headers: session.headers });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { planItemIds: string[] }).planItemIds;
}

async function openTodayList(page: Page) {
  await page.clock.install({ time: atSede(sedeDayFromToday(0, ZONE), LATE_BROWSER_TIME, ZONE) });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Reserva ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  providerId = staff.find((m) => m.fullName === admin.fullName)!.userId;
  catalogId = (
    await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `res-${suffix}`.slice(0, 20),
      kind: 'PROCEDURE',
      labelEs: `Implante ${suffix.slice(0, 6)}`,
      color: '#3366CC',
      defaultPrice: 100000,
    })
  ).id;
});

test('1440 px: «Llegó» avisa de la reserva en la otra cita y «Traer a esta cita» la mueve', async ({ page }) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  const s = await scenario(page, 'Lucía', 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTodayList(page);

  await page.getByRole('group', { name: `Estado de ${s.name} en la clínica` }).getByRole('button', { name: 'Llegó' }).click();
  await expect(page.getByText(`${s.name} llegó.`)).toBeVisible();
  // Aviso que no bloquea: el tratamiento y la fecha de la otra cita.
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: s.itemLabel });
  await expect(toast).toContainText(s.message);
  await expect(toast.getByRole('button', { name: 'Traer a esta cita' })).toBeVisible();

  // El panel «En clínica» lo repite junto a la persona.
  const panel = page.getByRole('region', { name: 'En clínica' });
  const notice = panel.getByRole('group', { name: NOTICE });
  await expect(notice).toContainText(s.itemLabel, { timeout: 10_000 });
  await expect(notice).toContainText(s.message);
  expect(await futurePlanItems(page, s.futureId)).toHaveLength(1);

  await notice.getByRole('button', { name: `Traer a esta cita: ${s.itemLabel}` }).click();
  await expect(page.getByText(`${s.itemLabel} quedó reservado en esta cita.`)).toBeVisible();
  await expect(panel.getByRole('group', { name: NOTICE })).toHaveCount(0, { timeout: 10_000 });
  expect(await futurePlanItems(page, s.futureId)).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test('390 px: el aviso en la hoja «En clínica» y «Traer a esta cita» con teclado', async ({ page }) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  const s = await scenario(page, 'Marta', 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTodayList(page);

  const arrive = page.getByRole('group', { name: `Estado de ${s.name} en la clínica` }).getByRole('button', { name: 'Llegó' });
  await arrive.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(`${s.name} llegó.`)).toBeVisible();
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: s.itemLabel });
  await expect(toast).toContainText(s.message);
  // QA D2: el botón del aviso es un objetivo táctil de 44 px.
  const toastAction = await toast.getByRole('button', { name: 'Traer a esta cita' }).boundingBox();
  expect(toastAction?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(toastAction?.width ?? 0).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: /^En clínica/ }).click();
  // QA D1: la hoja ya ofrece la acción; el aviso no queda encima sin recibir toques.
  await expect(toast).toHaveCount(0);
  const sheet = page.getByRole('dialog');
  const notice = sheet.getByRole('group', { name: NOTICE });
  await expect(notice).toContainText(s.message, { timeout: 10_000 });
  const claim = notice.getByRole('button', { name: `Traer a esta cita: ${s.itemLabel}` });
  await expectTouchTarget(claim, { scope: sheet });
  await expectNoHorizontalScroll(page);
  await claim.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(`${s.itemLabel} quedó reservado en esta cita.`)).toBeVisible();
  await expect(sheet.getByRole('group', { name: NOTICE })).toHaveCount(0, { timeout: 10_000 });
  expect(await futurePlanItems(page, s.futureId)).toEqual([]);
});
