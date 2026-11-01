import { test, expect, type Page } from './support/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AxeResults } from 'axe-core';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { LATE_BROWSER_TIME, SEDE_TODAY_TZ, atSede, sedeDayFromToday } from './support/clock';
import { E2E_TODAY_REGION } from './support/regional';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-293 (seguimiento de DX-288, revisión M2): «Llegó» con un
 * tratamiento que reserva OTRA cita de hoy con el paciente en la clínica.
 * «Traer a esta cita» daría siempre 409, así que no se ofrece: el aviso dice
 * dónde está la reserva.
 *
 * Una clínica nueva por corrida, sin horario, con recepción. Por paciente: un
 * plan aceptado con un implante en dos citas de hoy que ya empezaron, T y H.
 * La API no deja agendar en el pasado: las dos se crean mañana y se mueven a
 * hoy por la BD (E2E_DATABASE_URL, como DX-273; sin ella, salto permitido en
 * e2e/allowed-skips.json). H «llegó» por la API y se queda la reserva. El
 * navegador va a las 23:30 de la sede (DX-252).
 *  1. 1440 px, claro y oscuro: «Llegó» en T → aviso sin «Traer a esta cita»
 *     con la hora y la sede de H; el panel «En clínica» lo repite, sin botón.
 *  2. 390 px, oscuro y claro: lo mismo en la hoja «En clínica», que se lee
 *     completo y sin scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `encurso-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.cur.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.cur.${suffix}@example.com` };
const last = `EnCurso${suffix}`.slice(0, 40);
const MIN = 60_000;
const DB_SKIP = 'E2E_DATABASE_URL no definido: no se puede mover a hoy la cita que ya empezó';
const NOTICE = 'Tratamiento reservado en otra cita';
const CLAIM = /Traer a esta cita/;

/**
 * DX-449: la sede y el navegador van en `SEDE_TODAY_TZ` (la zona de la suite salvo cerca de
 * su medianoche): las citas «de hoy que ya empezaron» caben antes de «ahora»
 * sin cruzar de día, corra la CI a la hora que corra.
 */
const ZONE = SEDE_TODAY_TZ;
test.use({ timezoneId: ZONE });

let session: ApiSession;
let providerId: string;
let catalogId: string;
let locationName: string;

interface Scenario {
  name: string;
  itemLabel: string;
  message: string;
}

/** `HH:MM` (24 h) de la sede, como el aviso. */
function sedeClock(at: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/**
 * Mueve la cita a hoy, ya empezada hace `minutesAgo` min (5 min de largo).
 * `ZONE` deja al menos 3 h desde la medianoche: sigue siendo de hoy.
 * Devuelve su nuevo inicio.
 */
function moveToStartedToday(id: string, minutesAgo: number): Date {
  const start = new Date(Date.now() - minutesAgo * MIN);
  const end = new Date(start.getTime() + 5 * MIN);
  execFileSync('psql', [
    process.env.E2E_DATABASE_URL as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE appointments SET start = '${start.toISOString()}', "end" = '${end.toISOString()}' WHERE id = '${id}'`,
  ]);
  return start;
}

async function scenario(page: Page, name: string, base: number): Promise<Scenario> {
  const request = page.request;
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: name,
    lastName: last,
    docType: 'NATIONAL_ID',
    docNumber: `CUR${name}${suffix}`.slice(0, 20),
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
  const book = (hhmm: string) => {
    const tomorrow = atSede(sedeDayFromToday(1, ZONE), hhmm, ZONE);
    return apiPost<{ id: string }>(request, session, '/appointments', {
      patientId: patient.id,
      providerId,
      start: tomorrow.toISOString(),
      end: new Date(tomorrow.getTime() + 15 * MIN).toISOString(),
      planItemIds: [item.id],
    });
  };
  // T: mañana con el implante; a hoy, ya empezada (su reserva vence).
  const t = await book(`0${8 + (base % 2)}:00`);
  moveToStartedToday(t.id, base + 2);
  // H: lo mismo, y «llega» por la API: se queda la reserva.
  const h = await book(`1${base % 10}:00`);
  const holderStart = moveToStartedToday(h.id, base + 9);
  const arrived = await request.patch(`${API_URL}/appointments/${h.id}`, {
    headers: session.headers,
    data: { status: 'ARRIVED' },
  });
  expect(arrived.ok(), await arrived.text()).toBeTruthy();
  return {
    name: `${name} ${last}`,
    itemLabel: `Implante ${suffix.slice(0, 6)} · diente 36`,
    message: `Reservado en la cita de hoy a las ${sedeClock(holderStart)} (${locationName}), con el paciente en la clínica.`,
  };
}

async function openTodayList(page: Page) {
  await page.clock.install({ time: atSede(sedeDayFromToday(0, ZONE), LATE_BROWSER_TIME, ZONE) });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
}

/** «Llegó» en la cita T (la de H ya no lo ofrece: llegó). */
async function arrive(page: Page, s: Scenario) {
  await page.getByRole('group', { name: `Estado de ${s.name} en la clínica` }).getByRole('button', { name: 'Llegó' }).click();
  await expect(page.getByText(`${s.name} llegó.`)).toBeVisible();
}

/** Infracciones serias o críticas de axe dentro de `selector`. */
async function axeSerious(page: Page, selector: string) {
  await page.evaluate(readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'));
  const results = await page.evaluate(async (sel) => {
    const axe = (window as unknown as { axe: { run: (ctx: string) => Promise<AxeResults> } }).axe;
    return axe.run(sel);
  }, selector);
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
}

/** El aviso se lee completo: dentro de la pantalla y sin recortar el texto. */
async function expectFullyReadable(page: Page, notice: ReturnType<Page['getByRole']>, message: string) {
  const text = notice.getByText(message);
  await expect(text).toBeVisible();
  const box = await text.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  expect(await text.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica En Curso ${suffix}`,
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
  const locations = (await (await request.get(`${API_URL}/locations`, { headers: session.headers })).json()) as {
    name: string;
  }[];
  locationName = locations[0].name;
  catalogId = (
    await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `cur-${suffix}`.slice(0, 20),
      kind: 'PROCEDURE',
      labelEs: `Implante ${suffix.slice(0, 6)}`,
      color: '#3366CC',
      defaultPrice: 100000,
    })
  ).id;
});

test('1440 px: «Llegó» con la reserva en otra cita de hoy en la clínica, sin «Traer a esta cita», en claro y oscuro', async ({
  page,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  const s = await scenario(page, 'Lucía', 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await openTodayList(page);

  await arrive(page, s);
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: s.itemLabel });
  await expect(toast).toContainText(s.message);
  await expect(toast.getByRole('button', { name: CLAIM })).toHaveCount(0);

  const panel = page.getByRole('region', { name: 'En clínica' });
  const notice = panel.getByTestId('in-clinic-item').filter({ hasText: s.name }).getByRole('group', { name: NOTICE });
  await expect(notice).toContainText(s.itemLabel, { timeout: 10_000 });
  await expect(notice.getByRole('button', { name: CLAIM })).toHaveCount(0);
  await expectFullyReadable(page, notice, s.message);
  expect(await axeSerious(page, '[data-testid="reserved-elsewhere"]')).toEqual([]);
  await expectNoHorizontalScroll(page);

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expectFullyReadable(page, notice, s.message);
  expect(await axeSerious(page, '[data-testid="reserved-elsewhere"]')).toEqual([]);
});

test('390 px: el aviso en la hoja «En clínica» se lee completo y sin «Traer a esta cita», en oscuro y claro', async ({
  page,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, DB_SKIP);
  const s = await scenario(page, 'Marta', 20);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await openTodayList(page);

  await arrive(page, s);
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: s.itemLabel });
  await expect(toast).toContainText(s.message);
  await expect(toast.getByRole('button', { name: CLAIM })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: /^En clínica/ }).click();
  const notice = page
    .getByRole('dialog')
    .getByTestId('in-clinic-item')
    .filter({ hasText: s.name })
    .getByRole('group', { name: NOTICE });
  await expect(notice).toContainText(s.itemLabel, { timeout: 10_000 });
  await expect(notice.getByRole('button', { name: CLAIM })).toHaveCount(0);
  await expectFullyReadable(page, notice, s.message);
  expect(await axeSerious(page, '[role="dialog"] [data-testid="reserved-elsewhere"]')).toEqual([]);
  await expectNoHorizontalScroll(page);

  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expectFullyReadable(page, notice, s.message);
  expect(await axeSerious(page, '[role="dialog"] [data-testid="reserved-elsewhere"]')).toEqual([]);
});
