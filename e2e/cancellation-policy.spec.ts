import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AxeResults } from 'axe-core';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { chooseAppointmentStatus } from './support/appointment-status';
import { loginAs } from './support/auth';
import { sedeDate, sedeTime } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-279 (porción 1): el ADMIN configura la política de cancelación de la
 * sede principal (24 h) en Ajustes → Sedes; recepción cancela desde la agenda
 * una cita que empieza en unas horas, el diálogo le pide origen y motivo y
 * avisa «Cancelación tardía: aviso de N h, la política pide 24 h»; la ficha
 * del paciente muestra la insignia «1 cancelación tardía (12 meses)». A 1440
 * y a 390 px, sin scroll horizontal.
 *
 * Una clínica nueva por corrida, sede sin restricción de horario. En serie.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `cancelaciones-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.can.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.can.${suffix}@example.com` };

let session: ApiSession;
let providerId: string;
/** Paciente con la insignia (lo deja el primer test). */
let badgePatientId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Cancelaciones ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { timezone: 'America/Bogota', ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  providerId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === admin.fullName,
  )!.userId;
});

/** Paciente con una cita que empieza dentro de `hours` horas (minuto exacto). */
async function patientWithAppointment(
  request: Parameters<typeof apiPost>[0],
  lastName: string,
  hours: number,
): Promise<{ patientId: string; start: Date }> {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Paula',
    lastName,
    docType: 'CC',
    docNumber: `${lastName}`.slice(0, 20),
    sex: 'F',
  });
  const start = new Date(Math.ceil((Date.now() + hours * 3_600_000) / 60_000) * 60_000);
  await apiPost(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
  });
  return { patientId: patient.id, start };
}

/** El ADMIN guarda la política de la sede principal con `hours` de aviso. */
async function configurePolicy(page: import('@playwright/test').Page, hours: string, version: number) {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/sedes`);
  const section = page.getByRole('region', { name: 'Política de cancelación' });
  await expect(section).toBeVisible({ timeout: 15_000 });
  await section.getByRole('button', { name: /la política de Sede principal/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Política de cancelación · Sede principal' });
  await expectDialogInsideViewport(page, dialog);
  const field = dialog.getByLabel('Horas de aviso');
  await field.fill('200');
  await dialog.getByRole('button', { name: 'Guardar versión nueva' }).click();
  await expect(dialog.getByText('Escribe un número entero de 0 a 168.')).toBeVisible();
  await field.fill(hours);
  await dialog.getByLabel('Importe sugerido (opcional)').fill('50.000');
  await dialog.getByLabel('Texto para el paciente').fill('Avísanos con 24 horas de antelación.');
  await expect(dialog.getByText('36/1000')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Guardar versión nueva' }).click();
  await expect(dialog).toBeHidden();
  await expect(section.getByText(`${hours} h de aviso · versión ${version}`)).toBeVisible();
  await section.getByRole('button', { name: /Historial de versiones/ }).click();
  await expect(
    section.getByRole('list', { name: 'Historial de versiones · Sede principal' }).getByRole('listitem'),
  ).toHaveCount(version);
}

/** Recepción cancela tarde la cita desde la lista del día y ve la insignia en la ficha. */
async function cancelLateAndSeeBadge(
  page: import('@playwright/test').Page,
  patientId: string,
  start: Date,
) {
  await page.context().clearCookies();
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  const listToggle = page.getByRole('button', { name: 'Lista', exact: true });
  if (await listToggle.isVisible()) await listToggle.click();
  await page.getByLabel('Fecha', { exact: true }).fill(sedeDate(start));
  const end = new Date(start.getTime() + 30 * 60_000);
  const select = page
    .getByRole('combobox', { name: new RegExp(`^Estado de la cita de ${sedeTime(start)}–${sedeTime(end)}`) })
    .first();
  await expect(select).toBeVisible({ timeout: 15_000 });
  await chooseAppointmentStatus(select, 'Cancelada');

  const dialog = page.getByRole('dialog', { name: /Cancelar la cita de Paula/ });
  await expect(dialog).toBeVisible();
  await expectDialogInsideViewport(page, dialog);
  // Sin origen ni motivo no deja cancelar.
  await dialog.getByRole('button', { name: 'Cancelar la cita' }).click();
  await expect(dialog.getByText('Elige quién cancela.')).toBeVisible();
  await dialog.getByLabel(/El paciente avisa/).check();
  await expect(dialog.getByTestId('late-cancellation-warning')).toHaveText(
    /^Cancelación tardía: aviso de \d+ h( \d+ min)?, la política pide 24 h$/,
  );
  await dialog.getByLabel('Motivo').selectOption('TRANSPORT');
  await dialog.getByLabel('Detalle (opcional)').fill('Paro de transporte');
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Cancelar la cita' }).click();
  await expect(dialog).toBeHidden();
  await expect(select).toHaveText('Cancelada');

  await page.goto(`${origin}/patients/${patientId}`);
  await expect(page.getByTestId('attendance-badge')).toHaveText('1 cancelación tardía (12 meses)', {
    timeout: 15_000,
  });
  await expectNoHorizontalScroll(page);
}

test('1440 px: configurar la política → cancelar tarde desde la agenda → insignia en la ficha', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { patientId, start } = await patientWithAppointment(request, `Tardia${suffix}`.slice(0, 30), 5);
  await configurePolicy(page, '24', 1);
  await cancelLateAndSeeBadge(page, patientId, start);
  badgePatientId = patientId;
});

test('390 px: el mismo flujo cabe sin scroll horizontal', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { patientId, start } = await patientWithAppointment(request, `Movil${suffix}`.slice(0, 30), 6);
  await configurePolicy(page, '24', 2);
  await cancelLateAndSeeBadge(page, patientId, start);
});

test('axe: diálogo de cancelar, insignia y modal de la política, a 390 y 1440 px, en claro y oscuro', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  expect(badgePatientId, 'el primer test deja una paciente con la insignia').toBeTruthy();
  const { start } = await patientWithAppointment(request, `Axe${suffix}`.slice(0, 30), 8);
  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  /** axe sobre lo de DX-279 (`selector`), con las animaciones terminadas. */
  async function serious(selector: string) {
    // Sin el puntero encima de un botón: su hover no es su estado en reposo.
    await page.mouse.move(0, 0);
    await page.locator(selector).first().evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
    );
    await page.evaluate(axeSource);
    const results = await page.evaluate(async (include) => {
      const axe = (window as unknown as { axe: { run: (context: string) => Promise<AxeResults> } }).axe;
      return axe.run(include);
    }, selector);
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => `${n.target.join(' ')} :: ${n.failureSummary ?? ''}`),
      }));
  }
  const end = new Date(start.getTime() + 30 * 60_000);
  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const label = `${width} ${colorScheme}`;

      await loginAs(page, origin, admin.email, password);
      await page.goto(`${origin}/settings/sedes`);
      const section = page.getByRole('region', { name: 'Política de cancelación' });
      await section.getByRole('button', { name: /la política de Sede principal/ }).click({ timeout: 15_000 });
      await expect(page.getByRole('dialog')).toBeVisible();
      expect.soft(await serious('[role="dialog"]'), `modal de la política ${label}`).toEqual([]);
      await page.keyboard.press('Escape');

      await page.goto(`${origin}/patients/${badgePatientId}`);
      await expect(page.getByTestId('attendance-badge')).toBeVisible({ timeout: 15_000 });
      expect.soft(await serious('[data-testid="attendance-badge"]'), `ficha con insignia ${label}`).toEqual([]);

      await page.goto(`${origin}/agenda`);
      await page.getByRole('button', { name: 'Día', exact: true }).click();
      const listToggle = page.getByRole('button', { name: 'Lista', exact: true });
      if (await listToggle.isVisible()) await listToggle.click();
      await page.getByLabel('Fecha', { exact: true }).fill(sedeDate(start));
      const status = page
        .getByRole('combobox', { name: new RegExp(`^Estado de la cita de ${sedeTime(start)}–${sedeTime(end)}`) })
        .first();
      await expect(status).toBeVisible({ timeout: 15_000 });
      await chooseAppointmentStatus(status, 'Cancelada');
      const dialog = page.getByRole('dialog', { name: /Cancelar la cita de Paula/ });
      await dialog.getByLabel(/El paciente avisa/).check();
      await expect(dialog.getByTestId('late-cancellation-warning')).toBeVisible();
      await expectNoHorizontalScroll(page);
      expect.soft(await serious('[role="dialog"]'), `diálogo de cancelar ${label}`).toEqual([]);
      await dialog.getByRole('button', { name: 'Volver' }).click();
      await expect(dialog).toBeHidden();
      await page.context().clearCookies();
    }
  }
});
