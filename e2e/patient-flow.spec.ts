import { test, expect, type Page } from './support/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AxeResults } from 'axe-core';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { LATE_BROWSER_TIME, atSede, lastSlotToday, sedeDayFromToday, type SedeSlot } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-200: flujo del paciente en la clínica.
 *
 * Una clínica nueva por corrida (una sola sede, sin restricción de horario)
 * con dos odontólogas («Lina Flujo» y «Marta Flujo») y recepción, y dos citas
 * de HOY a las 23:55–23:59 de la sede: Ana con Lina y Berta con Marta. El
 * navegador va con el reloj fijo a las 23:30 de Bogotá (DX-252, TST-030): la
 * misma agenda a cualquier hora, sin `test.skip` cerca de medianoche (ver
 * `lastSlotToday` en support/clock.ts). En serie:
 * 1. 1440 px: recepción marca «Llegó» en la tarjeta de Ana (Día · Lista) y la
 *    ve en el panel lateral «En clínica»; Lina ve «Te esperan 1» en la
 *    navegación, la pasa al sillón y la deja lista para cobrar desde
 *    /agenda/en-clinica; recepción la completa y el panel queda vacío;
 * 2. 390 px: recepción marca «Llegó» a Berta (botón de 44 px), abre «En
 *    clínica» en la hoja y «Deshacer llegada» la devuelve a la agenda, sin
 *    scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `flujo-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.flu.${suffix}@example.com` };
const dentist = { fullName: 'Lina Flujo', email: `lina.flu.${suffix}@example.com` };
const dentist2 = { fullName: 'Marta Flujo', email: `marta.flu.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.flu.${suffix}@example.com` };
const last = `Flujo${suffix}`.slice(0, 40);

let session: ApiSession;
/** La franja de HOY de las dos citas (23:55–23:59 de la sede). */
let slot: SedeSlot;

/** El reloj del navegador, fijo a las 23:30 de hoy en la sede (y corriendo desde ahí). */
async function lateEvening(page: Page) {
  await page.clock.install({ time: atSede(slot.day, LATE_BROWSER_TIME) });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Flujo ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...dentist2, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  // Sin horario: las citas van a las 23:55 (ver disableBusinessHours).
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const idOf = (fullName: string) => members.find((m) => m.fullName === fullName)!.userId;

  slot = lastSlotToday();
  for (const [i, [name, providerId]] of ([
    ['Ana', idOf(dentist.fullName)],
    ['Berta', idOf(dentist2.fullName)],
  ] as const).entries()) {
    const patient = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: name,
      lastName: last,
      docType: 'CC',
      docNumber: `FLU${i}${suffix}`.slice(0, 20),
      sex: 'F',
    });
    await apiPost(request, session, '/appointments', {
      patientId: patient.id,
      providerId,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      reason: 'Endodoncia',
    });
  }
});

async function openTodayList(page: Page) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
}

test('1440 px: llegó → en sillón → listo para cobrar → completada', async ({ page, browser }) => {
  await lateEvening(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await openTodayList(page);

  // La tarjeta de Ana: «Llegó» (recepción no tiene «En sillón»).
  const anaActions = page
    .getByRole('group', { name: `Estado de Ana ${last} en la clínica` })
    .first();
  await expect(anaActions.getByRole('button', { name: 'En sillón' })).toHaveCount(0);
  await anaActions.getByRole('button', { name: 'Llegó' }).click();
  await expect(page.getByText(`Ana ${last} llegó.`)).toBeVisible();

  // El panel lateral (≥ 1400 px) la muestra en espera, con su chip.
  const panel = page.getByRole('region', { name: 'En clínica' });
  const waiting = panel.getByTestId('in-clinic-group-waiting');
  await expect(waiting.getByTestId('in-clinic-item')).toHaveCount(1, { timeout: 10_000 });
  await expect(waiting.getByTestId('in-clinic-item')).toContainText(`Ana ${last}`);
  await expect(waiting.getByTestId('in-clinic-item')).toHaveAttribute('data-punctuality', 'ON_TIME');
  await expect(waiting).toContainText('Espera 0 min');
  await expect(panel).not.toContainText('Endodoncia');
  await expect(panel.getByRole('link', {name:'Abrir a pantalla completa'})).toHaveAttribute('href','/agenda/en-clinica');

  // La odontóloga: «Te esperan 1» en la navegación y su panel.
  const lina = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Bogota', locale: 'es-CO' });
  await lateEvening(lina);
  await loginAs(lina, origin, dentist.email, password);
  await expect(lina.getByRole('link', { name: 'Agenda · Te espera 1 paciente' }).first()).toBeVisible({
    timeout: 15_000,
  });
  // El reloj de Lina ya está instalado (lateEvening): el sondeo avanza con runFor.
  let inClinicReads = 0;
  let locationReads = 0;
  lina.on('request', (req) => {
    if (req.method() !== 'GET') return;
    const url = new URL(req.url());
    if (url.pathname === '/api/v1/appointments/in-clinic') inClinicReads++;
    if (url.pathname === '/api/v1/locations') locationReads++;
  });
  await lina.goto(`${origin}/agenda`);
  await expect(lina.getByTestId('in-clinic-group-waiting').getByTestId('in-clinic-item')).toHaveCount(1);
  await expect.poll(() => inClinicReads).toBe(1);
  await lina.clock.runFor(45_000);
  await expect.poll(() => inClinicReads).toBe(2);
  await lina.waitForLoadState('networkidle');
  await lina.clock.runFor(45_000);
  await expect.poll(() => inClinicReads).toBe(3);
  expect(locationReads).toBeLessThanOrEqual(1);
  await lina.getByRole('link', {name:'Te espera 1 paciente', exact:true}).first().click();
  await expect(lina).toHaveURL(`${origin}/agenda/en-clinica`);
  await expect(lina.getByRole('heading', { level: 1, name: 'Te esperan' })).toBeVisible();
  // Volver por navegación real: el cambio y el foco se prueban en el panel lateral.
  await lina.locator('main').getByRole('link', { name: 'Agenda', exact: true }).click();
  await expect(lina).toHaveURL(`${origin}/agenda`);
  await lina.getByRole('button', { name: 'En sillón' }).focus();
  await lina.keyboard.press('Enter');
  const inChair = lina.getByTestId('in-clinic-group-inChair');
  await expect(inChair.getByTestId('in-clinic-item')).toContainText(`Ana ${last}`, { timeout: 10_000 });
  await expect(inChair.getByRole('button', { name: 'Listo para cobrar' })).toBeFocused();
  await lina.keyboard.press('Enter');
  const ready = lina.getByTestId('in-clinic-group-readyForCheckout');
  await expect(ready.getByTestId('in-clinic-item')).toContainText(`Ana ${last}`, { timeout: 10_000 });
  // La salida es de recepción: la odontóloga no tiene «Completar».
  await expect(ready.getByRole('button', { name: 'Completar' })).toHaveCount(0);
  await lina.close();

  // Recepción la completa desde su panel (se relee al volver a la agenda).
  await page.goto(`${origin}/agenda/en-clinica`);
  const readyHere = page.getByTestId('in-clinic-group-readyForCheckout');
  await readyHere.getByRole('button', { name: 'Completar' }).click();
  await expect(page.getByText(`Cita de Ana ${last} completada.`)).toBeVisible();
  await expect(page.getByText('Nadie en espera')).toBeVisible({ timeout: 10_000 });
  await expect(readyHere.getByRole('heading')).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

  await openTodayList(page);
  await expect(
    page.getByRole('row').filter({ hasText: `Ana ${last}` }).getByTestId('appointment-status-select'),
  ).toHaveText('Completada');
});

test('390 px: «Deshacer llegada» devuelve la cita a la agenda', async ({ page }) => {
  await lateEvening(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await openTodayList(page);

  const arrive = page
    .getByRole('group', { name: `Estado de Berta ${last} en la clínica` })
    .getByRole('button', { name: 'Llegó' });
  const box = await arrive.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await arrive.click();
  await expect(page.getByText(`Berta ${last} llegó.`)).toBeVisible();

  await page.getByRole('button', { name: /^En clínica/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('link', {name:'Abrir a pantalla completa'})).toHaveAttribute('href','/agenda/en-clinica');
  const item = sheet.getByTestId('in-clinic-item').filter({ hasText: `Berta ${last}` });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalScroll(page);
  await item.getByRole('button', { name: 'Deshacer llegada' }).click();
  await expect(page.getByText(`Se deshizo la llegada de Berta ${last}.`)).toBeVisible();
  await expect(sheet.getByText('Nadie en espera')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');

  // De vuelta en la agenda: confirmada… o agendada, como estaba; y con «Llegó».
  await expect(
    page.getByRole('group', { name: `Estado de Berta ${last} en la clínica` }).getByRole('button', {
      name: 'Llegó',
    }),
  ).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalScroll(page);
});


const MIN = 60_000;
const qaStatuses = ['SCHEDULED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW','ARRIVED','IN_CHAIR','READY_FOR_CHECKOUT'] as const;
const qaLabels = ['Agendada','Confirmada','Completada','Cancelada','No asistió','En espera','En sillón','Listo para cobrar'];
const qaIds: string[] = [];
/**
 * DX-252 (TST-030): las ocho citas del QA van HOY a horas fijas de la sede
 * (08:00, 08:30… 11:30), corra la suite a la hora que corra. La API no deja
 * agendar en el pasado ni marcar la llegada otro día, así que se crean mañana
 * a esas horas y se mueven a hoy por la BD antes de cambiarles el estado. Sin
 * BD e2e aislada (E2E_DATABASE_URL) el QA se salta con ese motivo, en la lista
 * de e2e/allowed-skips.json; nunca por la hora.
 */
const QA_DB_SKIP = 'E2E_DATABASE_URL no definido: no se pueden mover a hoy las citas de los ocho estados';
function moveQaAppointmentToToday(id: string, start: Date, end: Date): void {
  execFileSync('psql', [
    process.env.E2E_DATABASE_URL as string,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `UPDATE appointments SET start = '${start.toISOString()}', "end" = '${end.toISOString()}' WHERE id = '${id}'`,
  ]);
}

test('DX-242: prepara ocho estados reales para QA de accesibilidad', async ({request}) => {
  test.skip(!process.env.E2E_DATABASE_URL, QA_DB_SKIP);
  const today = sedeDayFromToday(0);
  const tomorrow = sedeDayFromToday(1);
  const qaDentist = {fullName:'Odontóloga Estados QA', email:`estados.${suffix}@example.com`, role:'DENTIST', password};
  await addStaffViaApi(request, session, qaDentist);
  const staff = await request.get(`${API_URL}/staff`, {headers:session.headers});
  const members = await staff.json() as {userId:string; fullName:string}[];
  const providerId = members.find(m => m.fullName === qaDentist.fullName)!.userId;
  for (const [i,status] of qaStatuses.entries()) {
    const patient = await apiPost<{id:string}>(request, session, '/patients', {firstName:`Estado ${i+1}`, lastName:'QA', docType:'CC', docNumber:`EST${i}${suffix}`.slice(0,20), sex:'F'});
    const hhmm = `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    const minutes = i%2 ? 30:15;
    const draftStart = atSede(tomorrow, hhmm);
    const appointment = await apiPost<{id:string}>(request, session, '/appointments', {patientId:patient.id, providerId, start:draftStart.toISOString(), end:new Date(draftStart.getTime()+minutes*MIN).toISOString(), reason:'Control QA'});
    const start = atSede(today, hhmm);
    moveQaAppointmentToToday(appointment.id, start, new Date(start.getTime()+minutes*MIN));
    qaIds.push(appointment.id);
    const steps = status === 'IN_CHAIR' ? ['ARRIVED','IN_CHAIR'] : status === 'READY_FOR_CHECKOUT' ? ['ARRIVED','IN_CHAIR','READY_FOR_CHECKOUT'] : status === 'SCHEDULED' ? [] : [status];
    for (const step of steps) {
      const result = await request.patch(`${API_URL}/appointments/${appointment.id}`, {headers:session.headers, data:step === 'CANCELLED' ? {status:step, cancelledByKind:'CLINIC', cancelReasonCode:'CLINIC_RESCHEDULE'} : {status:step}});
      expect(result.ok(), await result.text()).toBeTruthy();
    }
  }
});

test('DX-242: axe Día/Semana/En clínica 390/1440 claro/oscuro', async ({page}, testInfo) => {
  test.setTimeout(240_000);
  test.skip(!process.env.E2E_DATABASE_URL, QA_DB_SKIP);
  expect(qaIds, 'el test anterior prepara las ocho citas de hoy').toHaveLength(8);
  await lateEvening(page);
  for (const width of [390,1440]) for (const colorScheme of ['light','dark'] as const) {
    const evidence = process.env.DX242_QA_DIR ?? testInfo.outputPath('qa');
    mkdirSync(evidence, {recursive:true});
    await page.setViewportSize({width, height:900});
    await page.emulateMedia({colorScheme, reducedMotion:'reduce'});
    await loginAs(page, origin, reception.email, password);
    await page.evaluate(() => localStorage.removeItem('theme'));
    await page.goto(`${origin}/agenda`);
    const reports: {surface:string; violations:AxeResults['violations']}[] = [];
    const check = async (surface:string) => {
      await page.evaluate(readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'));
      const results = await page.evaluate(async () => {
        const axe = (window as unknown as {axe:{run:() => Promise<AxeResults>}}).axe;
        return axe.run();
      });
      const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
      reports.push({surface, violations:results.violations});
      writeFileSync(path.join(evidence, `axe-${width}-${colorScheme}.json`), JSON.stringify(reports,null,2));
      await page.screenshot({path:path.join(evidence, `${surface}-${width}-${colorScheme}.png`), fullPage:true});
      expect.soft(serious.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
      await expectNoHorizontalScroll(page);
    };
    await page.getByRole('button', {name:'Día', exact:true}).click();
    if (width === 390) await page.getByRole('group', {name:'Profesional visible'}).getByRole('button', {name:'Odontóloga Estados QA', exact:true}).click();
    await expect(page.getByRole('button', {name:/Detalle.*Estado 1 QA/})).toBeVisible();
    await page.getByRole('button', {name:/Detalle.*Estado 1 QA/}).scrollIntoViewIfNeeded();
    await check('dia');
    await page.getByRole('button', {name:'Semana', exact:true}).click();
    for (const [i,id] of qaIds.entries()) {
      await expect(page.locator(`[data-testid="week-grid-appointment"][data-id="${id}"]`)).toHaveAccessibleName(new RegExp(qaLabels[i]));
    }
    await page.locator(`[data-testid="week-grid-appointment"][data-id="${qaIds[0]}"]`).scrollIntoViewIfNeeded();
    await check('semana');
    await page.evaluate(() => { document.documentElement.style.filter='grayscale(1)'; });
    await page.screenshot({path:path.join(evidence, `semana-grises-${width}-${colorScheme}.png`), fullPage:true});
    await page.evaluate(() => { document.documentElement.style.removeProperty('filter'); });
    await page.goto(`${origin}/agenda/en-clinica`);
    await expect(page.getByTestId('in-clinic-item')).toHaveCount(3);
    await check('en-clinica');
  }
});
