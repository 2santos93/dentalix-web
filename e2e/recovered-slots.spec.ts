import { randomUUID } from 'node:crypto';
import { test, expect, type Locator, type Page } from './support/test';
import { fillDate } from './support/dates';
import { confirmCancellation } from './support/cancellation';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';
import { chooseAppointmentStatus } from './support/appointment-status';

/**
 * e2e DX-436: «Reportes» → «Huecos recuperados».
 *
 * Una clínica nueva por corrida (el informe parte de cero) con una
 * odontóloga, horario lun–vie 9–13 (zona de la sede), una cita de Gabi a las
 * 10:00 y un pendiente de la lista de espera (Ana). En serie:
 * 1. 1440 px: el ADMIN cancela la cita de Gabi → «Ocupar este hueco» →
 *    «Asignar» a Ana → el informe del mes del hueco dice 1 liberado, 1
 *    rellenado y 1 por la lista, con la tasa de cancelación al lado de la de
 *    relleno y la fila de la odontóloga.
 * 2. 390 px: el mismo informe sin scroll horizontal; las tablas son tarjetas.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `recup-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.rec.${suffix}@example.com` };
const dentist = { fullName: 'Lina Recupera', email: `lina.rec.${suffix}@example.com` };
const last = `Recup${suffix}`.slice(0, 40);

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const day = sedeDayFromToday(n);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}

const SLOT_DAY = weekdayFrom(1);
/** El informe se pide por el mes del hueco (`?mes=AAAA-MM`). */
const SLOT_MONTH = SLOT_DAY.slice(0, 7);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Recupera ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: {
      ranges: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 780 })),
    },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const linaId = members.find((m) => m.fullName === dentist.fullName)!.userId;

  const patient = async (firstName: string, n: number) =>
    (
      await apiPost<{ id: string }>(request, session, '/patients', {
        firstName,
        lastName: last,
        docType: 'NATIONAL_ID',
        docNumber: `REC${n}${suffix}`.slice(0, 20),
        sex: 'F',
        phone: '4141234567',
      })
    ).id;
  const gabi = await patient('Gabi', 1);
  const ana = await patient('Ana', 2);
  await apiPost(request, session, '/appointments', {
    patientId: gabi,
    providerId: linaId,
    start: atSede(SLOT_DAY, '10:00').toISOString(),
    end: atSede(SLOT_DAY, '10:30').toISOString(),
  });
  await apiPost(request, session, '/waitlist', { patientId: ana, durationMinutes: 30 });
});

function column(page: Page, name: string): Locator {
  return page.locator(`[data-testid="day-column"][aria-label="${name}"]`);
}

async function openReport(page: Page): Promise<void> {
  await page.goto(`${origin}/reportes?tab=huecos-recuperados&mes=${SLOT_MONTH}`);
  await expect(page.getByRole('tab', { name: 'Huecos recuperados' })).toHaveAttribute('aria-selected', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('recovered-freed')).toBeVisible({ timeout: 30_000 });
}

test('1440 px: cancelar → «Ocupar este hueco» → «Asignar» → el informe muestra 1 recuperado', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);

  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Columnas', exact: true }).click();
  await fillDate(page, 'Fecha', SLOT_DAY);
  await expect(page.getByTestId('day-column').first()).toBeVisible({ timeout: 15_000 });

  await column(page, dentist.fullName)
    .getByRole('button', { name: new RegExp(`^10:00–10:30 · Gabi ${last}.*Detalle de la cita`) })
    .click();
  const detail = page.getByRole('dialog').filter({ hasText: 'Estado' });
  await chooseAppointmentStatus(detail.getByRole('combobox', { name: /^Estado: / }), 'Cancelada');
  await confirmCancellation(page, 'El paciente avisa', 'ILLNESS');
  await detail.getByRole('button', { name: 'Ocupar este hueco', exact: true }).click();

  const panel = page.getByTestId('fill-opening-panel');
  const ana = panel.getByTestId('opening-candidate').filter({ hasText: `Ana ${last}` });
  await expect(ana).toBeVisible({ timeout: 10_000 });
  await ana.getByRole('button', { name: `Asignar el hueco a Ana ${last}` }).click();
  await expect(panel).toBeHidden({ timeout: 10_000 });
  await expect(
    column(page, dentist.fullName).getByRole('button', {
      name: new RegExp(`^10:00–10:30 · Ana ${last}.*Detalle de la cita`),
    }),
  ).toBeVisible({ timeout: 10_000 });

  await openReport(page);
  await expect(page.getByTestId('recovered-freed')).toContainText('1');
  await expect(page.getByTestId('recovered-filled')).toContainText('1');
  await expect(page.getByTestId('recovered-by-list')).toContainText('1');
  await expect(page.getByTestId('recovered-fill-rate')).toContainText('100');
  // La tasa de cancelación, al lado de la de relleno (el ticket lo exige).
  const nextToFill = await page
    .getByTestId('recovered-fill-rate')
    .evaluate((el) => el.nextElementSibling?.getAttribute('data-testid'));
  expect(nextToFill).toBe('recovered-cancellation-rate');
  const byProvider = page.getByRole('table', { name: 'Huecos recuperados por profesional' });
  await expect(byProvider.getByRole('row', { name: new RegExp(dentist.fullName) })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar CSV' })).toBeVisible();
});

test('390 px: el informe sin scroll horizontal y con las tablas en tarjetas', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await openReport(page);
  await expect(page.getByRole('list', { name: 'Huecos recuperados por profesional' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Huecos recuperados por profesional' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
});
