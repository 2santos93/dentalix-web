import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { chooseAppointmentStatus } from './support/appointment-status';
import { axeInBothThemes } from './support/axe';
import { atSede, sedeDayFromToday } from './support/clock';
import { fillDate } from './support/dates';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

// DX-180: la vista Semana con teclado y lector, a 390 y 1440 px.
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `semana-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.semana.${suffix}@example.com` };
const dentist = { fullName: 'Luis Teclado', email: `luis.semana.${suffix}@example.com` };
const day = sedeDayFromToday(3);
let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Semana ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const dentistId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (s) => s.fullName === dentist.fullName,
  )!.userId;
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBe(true);
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Ángela',
    lastName: `Teclado ${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `KB${suffix}`.slice(0, 20),
    sex: 'F',
  });
  await apiPost(request, session, '/appointments', {
    patientId: patient.id,
    providerId: dentistId,
    start: atSede(day, '09:00'),
    end: atSede(day, '09:30'),
  });
});

async function openWeek(page: Page) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  await expect(page.getByTestId('week-grid-appointment').first()).toBeVisible({ timeout: 15_000 });
}

const focusedTestId = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');

for (const { width, height } of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Semana: de la rejilla a la primera cita sin recorrer los huecos, y sin scroll de página (${width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loginAs(page, origin, admin.email, password);
    await openWeek(page);
    await expect(page.getByRole('region', { name: 'Agenda de la semana' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Desde la primera cabecera de día: las 7 cabeceras, el marco y un hueco.
    await page.getByTestId('week-day-header').first().focus();
    let presses = 0;
    while ((await focusedTestId(page)) !== 'week-grid-appointment' && presses < 10) {
      await page.keyboard.press('Tab');
      presses += 1;
    }
    expect(await focusedTestId(page)).toBe('week-grid-appointment');
  });
}

test('DX-065: la primera parada es «Saltar al contenido» y lleva al contenido', async ({ page }) => {
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#contenido')).toBeFocused();
});

for (const { width, height } of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`DX-538: el fallo al cambiar el estado desde el detalle se reintenta dentro del detalle (${width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loginAs(page, origin, admin.email, password);
    await openWeek(page);
    await page.getByTestId('week-grid-appointment').first().click();
    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    let failed = 0;
    await page.route(/\/appointments\/[^/?]+$/, async (route) => {
      if (route.request().method() === 'PATCH' && failed === 0) {
        failed += 1;
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":500}' });
        return;
      }
      await route.continue();
    });
    const status = detail.getByRole('combobox').first();
    const before = (await status.textContent()) ?? '';
    const target = before.includes('Confirmada') ? 'Agendada' : 'Confirmada';
    await chooseAppointmentStatus(status, target);
    const retry = detail.getByRole('button', { name: 'Reintentar' });
    await expect(retry).toBeVisible({ timeout: 10_000 });
    // El aviso flotante no lleva un botón que no se podría pulsar.
    await expect(page.locator('[data-sonner-toast]').getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await retry.click();
    await expect(retry).toHaveCount(0, { timeout: 10_000 });
    await expect(status).toHaveText(target, { timeout: 10_000 });
    expect(failed).toBe(1);
  });
}

test('Semana: con flechas y Enter se abre la cita nueva en el hueco elegido, sin ratón', async ({ page }) => {
  await loginAs(page, origin, admin.email, password);
  await openWeek(page);
  await page.getByTestId('week-day-header').last().focus();
  await page.keyboard.press('Tab');
  while (!(await focusedTestId(page)).startsWith('week-grid-slot-')) await page.keyboard.press('Tab');
  const before = await focusedTestId(page);
  await page.keyboard.press('ArrowDown');
  expect(await focusedTestId(page)).not.toBe(before);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});

for (const { width, height } of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`axe sin violaciones serias en Día y Semana (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await loginAs(page, origin, admin.email, password);
    await openWeek(page);
    for (const view of ['Semana', 'Día']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      const found = await axeInBothThemes(page, page.locator('main'));
      for (const scheme of ['light', 'dark'] as const) {
        const blocking = found[scheme].filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(blocking, `axe (${scheme}) en ${view} a ${width} px`).toEqual([]);
      }
    }
  });
}
