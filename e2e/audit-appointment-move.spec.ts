import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-133-bis: una cita movida se lee en la auditoría con la hora y el
 * profesional antes y después («Cita movida · Antes: …, Ana · Después: …,
 * Luis»), por nombre y nunca por id. La cita se agenda y se mueve por la API
 * real (de Ana a las 10:00 a Luis a las 11:00); la pantalla es la de ADMIN,
 * en escritorio (tabla) y en el teléfono (tarjetas), sin scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `audmove-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.audmove.${suffix}@example.com` };
const dentist = { fullName: 'Luis Movido', email: `luis.audmove.${suffix}@example.com` };
const day = sedeDayFromToday(3);

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Movimientos ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const anaId = members.find((m) => m.fullName === admin.fullName)!.userId;
  const luisId = members.find((m) => m.fullName === dentist.fullName)!.userId;
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Marta',
    lastName: `Movida${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `MOV${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId: anaId,
    start: atSede(day, '10:00').toISOString(),
    end: atSede(day, '10:30').toISOString(),
  });
  const moved = await request.patch(`${API_URL}/appointments/${appointment.id}`, {
    headers: session.headers,
    data: {
      providerId: luisId,
      start: atSede(day, '11:00').toISOString(),
      end: atSede(day, '11:30').toISOString(),
    },
  });
  expect(moved.ok(), `PATCH de la cita falló: ${await moved.text()}`).toBeTruthy();
});

function auditLog(page: Page, width: number) {
  const name = 'Registro de auditoría';
  return width < 640 ? page.getByRole('list', { name }) : page.getByRole('table', { name });
}

for (const viewport of VIEWPORTS) {
  test(`la auditoría pinta la cita movida con hora y profesional antes y después (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAs(page, origin, admin.email, password);
    await page.goto(`${origin}/settings/auditoria`);
    const log = auditLog(page, viewport.width);
    await expect(log).toBeVisible({ timeout: 15_000 });
    const detail = log.getByText(/^Cita movida · Antes: /);
    await expect(detail).toHaveCount(1, { timeout: 15_000 });
    // Las horas con el reloj de la sede (es-VE, 12 h) y los profesionales por nombre.
    await expect(detail).toHaveText(
      /^Cita movida · Antes: .*10:00.*, Ana Titular · Después: .*11:00.*, Luis Movido$/,
    );
    await expect(log.getByText(/[0-9a-f]{8}-[0-9a-f]{4}-/)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
}
