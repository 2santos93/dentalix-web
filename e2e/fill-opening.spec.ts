import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-210: «Ocupar este hueco».
 *
 * Una clínica nueva por corrida con una odontóloga («Lina Hueco») y recepción,
 * horario lun–vie 9–13 y 15–19 (Bogotá), una cita de 30 min de Gabi a las
 * 10:00, un pendiente URGENT (Ana) y otro NORMAL (Berta) de 30 min, y una cita
 * de Elena dentro de 3 semanas marcada «Adelantar si hay hueco». En serie:
 * 1. 1440 px: recepción cancela la cita de Gabi → «Ocupar este hueco» lista a
 *    Ana (Urgente) antes que a Berta y a Elena → «Asignar» a Ana → la agenda
 *    muestra a Ana en el hueco;
 * 2. 390 px: el panel de un hueco libre es una hoja a pantalla completa, sin
 *    scroll horizontal, y Elena se adelanta con «Asignar».
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `hueco-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.hue.${suffix}@example.com` };
const dentist = { fullName: 'Lina Hueco', email: `lina.hue.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.hue.${suffix}@example.com` };
const last = `Hueco${suffix}`.slice(0, 40);

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const day = sedeDayFromToday(n);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}

const SLOT_DAY = weekdayFrom(2);
const FAR_DAY = weekdayFrom(23);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Hueco ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: {
      timezone: 'America/Bogota',
      ranges: [1, 2, 3, 4, 5].flatMap((weekday) => [
        { weekday, startMinute: 540, endMinute: 780 },
        { weekday, startMinute: 900, endMinute: 1140 },
      ]),
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
        docType: 'CC',
        docNumber: `HUE${n}${suffix}`.slice(0, 20),
        sex: 'F',
        phone: '3101234567',
      })
    ).id;
  const [gabi, ana, berta, elena] = [
    await patient('Gabi', 1),
    await patient('Ana', 2),
    await patient('Berta', 3),
    await patient('Elena', 4),
  ];
  await apiPost(request, session, '/appointments', {
    patientId: gabi,
    providerId: linaId,
    start: atSede(SLOT_DAY, '10:00').toISOString(),
    end: atSede(SLOT_DAY, '10:30').toISOString(),
  });
  // DX-128: Ana dio en persona el permiso de WhatsApp; Berta no (se la llama).
  const optIn = await request.patch(`${API_URL}/patients/${ana}/communication`, {
    headers: session.headers,
    data: { whatsappOptIn: true, whatsappOptInSource: 'IN_PERSON' },
  });
  expect(optIn.ok()).toBeTruthy();
  await apiPost(request, session, '/waitlist', { patientId: berta, durationMinutes: 30 });
  await apiPost(request, session, '/waitlist', {
    patientId: ana,
    durationMinutes: 30,
    priority: 'URGENT',
  });
  await apiPost(request, session, '/appointments', {
    patientId: elena,
    providerId: linaId,
    start: atSede(FAR_DAY, '09:00').toISOString(),
    end: atSede(FAR_DAY, '09:30').toISOString(),
    wantsEarlier: true,
  });
});

function column(page: Page, name: string): Locator {
  return page.locator(`[data-testid="day-column"][aria-label="${name}"]`);
}

async function openDay(page: Page, day: string) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByLabel('Fecha', { exact: true }).fill(day);
  await expect(page.getByTestId('day-column').first()).toBeVisible({ timeout: 15_000 });
}

test('1440 px: cancelar una cita → «Ocupar este hueco» → «Asignar» → la agenda muestra al nuevo paciente', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await openDay(page, SLOT_DAY);

  // Cancelar la cita de Gabi desde su detalle.
  await column(page, dentist.fullName)
    .getByRole('button', { name: new RegExp(`Detalle de la cita de 10:00–10:30 · Gabi ${last}`) })
    .click();
  const detail = page.getByRole('dialog').filter({ hasText: 'Estado' });
  await detail.getByLabel('Estado', { exact: true }).selectOption('CANCELLED');
  // El detalle (y el aviso de «Cita cancelada.») ofrecen ocupar el hueco.
  await detail.getByRole('button', { name: 'Ocupar este hueco', exact: true }).click();

  const panel = page.getByTestId('fill-opening-panel');
  await expect(panel.getByRole('heading', { name: 'Ocupar este hueco' })).toBeVisible();
  const rows = panel.getByTestId('opening-candidate');
  await expect(rows).toHaveCount(3, { timeout: 10_000 });
  await expect(rows.nth(0)).toContainText(`Ana ${last}`);
  await expect(rows.nth(0)).toContainText('Urgente');
  await expect(rows.nth(1)).toContainText(`Berta ${last}`);
  await expect(rows.nth(2)).toContainText(`Elena ${last}`);
  await expect(rows.nth(2)).toContainText('Cita actual');
  // WhatsApp solo con el permiso de DX-128 (el texto sin datos clínicos lo
  // fija el jest del panel); sin él, «Llamar».
  await expect(
    rows.nth(0).getByRole('button', { name: `Ofrecer el hueco por WhatsApp a Ana ${last}` }),
  ).toBeVisible();
  await expect(rows.nth(1).getByText('Sin permiso de WhatsApp: llámalo')).toBeVisible();
  await expect(
    rows.nth(1).getByRole('link', { name: new RegExp(`^Llamar a Berta ${last} al `) }),
  ).toBeVisible();

  await rows.nth(0).getByRole('button', { name: `Asignar el hueco a Ana ${last}` }).click();
  await expect(panel).toBeHidden({ timeout: 10_000 });
  await expect(
    column(page, dentist.fullName).getByRole('button', {
      name: new RegExp(`Detalle de la cita de 10:00–10:30 · Ana ${last}`),
    }),
  ).toBeVisible({ timeout: 10_000 });
});

test('390 px: el hueco libre abre la hoja a pantalla completa y Elena se adelanta con «Asignar»', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await openDay(page, SLOT_DAY);
  await page.getByRole('button', { name: dentist.fullName, exact: true }).click();

  const gap = column(page, dentist.fullName).getByRole('button', {
    name: `Ocupar el hueco libre de 15:00–19:00 · ${dentist.fullName}`,
  });
  await gap.focus();
  await page.keyboard.press('Enter');

  const panel = page.getByTestId('fill-opening-panel');
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => {
      const box = await panel.boundingBox();
      return box ? [Math.round(box.x), Math.round(box.width), Math.round(box.height)] : null;
    })
    .toEqual([0, 390, 844]);
  await expectNoHorizontalScroll(page);

  const elena = panel.getByTestId('opening-candidate').filter({ hasText: `Elena ${last}` });
  await elena.getByRole('button', { name: `Asignar el hueco a Elena ${last}` }).click();
  await expect(panel).toBeHidden({ timeout: 10_000 });
  await expect(
    column(page, dentist.fullName).getByRole('button', {
      name: new RegExp(`Detalle de la cita de 15:00–15:30 · Elena ${last}`),
    }),
  ).toBeVisible({ timeout: 10_000 });
});
