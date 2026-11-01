import { test, expect, type Locator, type Page } from './support/test';
import { confirmCancellation } from './support/cancellation';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';
import { chooseAppointmentStatus } from './support/appointment-status';
import { fillDate } from './support/dates';

/**
 * e2e DX-435: oferta de hueco por enlace — el primero que acepta se queda la
 * cita.
 *
 * Clínica nueva por corrida con una odontóloga y recepción, una cita de Gabi a
 * las 10:00 y dos pendientes de 30 min (Ana y Carla) con permiso de WhatsApp.
 * Recepción (1440 px) cancela la cita de Gabi → «Ocupar este hueco» → elige a
 * Ana y a Carla → «Enviar oferta con enlace» por WhatsApp. Ana abre su enlace
 * en el móvil (390 px, sin sesión) y acepta; el panel pasa a «Aceptado por
 * Ana» sin recargar (sondeo) y la agenda la muestra a las 10:00. Carla abre
 * el suyo y ve «Este hueco ya se ocupó».
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `oferta-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Olga Titular', email: `olga.of.${suffix}@example.com` };
const dentist = { fullName: 'Lina Oferta', email: `lina.of.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.of.${suffix}@example.com` };
const last = `Oferta${suffix}`.slice(0, 40);

/** Primer día laborable (lun–vie) de la sede a `from` días o más. */
function weekdayFrom(from: number): string {
  for (let n = from; ; n++) {
    const day = sedeDayFromToday(n);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
}
const SLOT_DAY = weekdayFrom(2);

let session: ApiSession;

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Oferta ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: {
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
        docType: 'NATIONAL_ID',
        docNumber: `OFE${n}${suffix}`.slice(0, 20),
        sex: 'F',
        phone: '3101234567',
      })
    ).id;
  const [gabi, ana, carla] = [await patient('Gabi', 1), await patient('Ana', 2), await patient('Carla', 3)];
  await apiPost(request, session, '/appointments', {
    patientId: gabi,
    providerId: linaId,
    start: atSede(SLOT_DAY, '10:00').toISOString(),
    end: atSede(SLOT_DAY, '10:30').toISOString(),
  });
  for (const id of [ana, carla]) {
    // DX-128: el permiso de WhatsApp, dado en persona.
    const optIn = await request.patch(`${API_URL}/patients/${id}/communication`, {
      headers: session.headers,
      data: { whatsappOptIn: true, whatsappOptInSource: 'IN_PERSON' },
    });
    expect(optIn.ok()).toBeTruthy();
    await apiPost(request, session, '/waitlist', { patientId: id, durationMinutes: 30 });
  }
});

function column(page: Page, name: string): Locator {
  return page.locator(`[data-testid="day-column"][aria-label="${name}"]`);
}

/** El enlace público que lleva el texto de «Abrir WhatsApp», en el host de la clínica. */
async function offerPath(link: Locator): Promise<string> {
  const href = decodeURIComponent((await link.getAttribute('href')) ?? '');
  const match = /\/hueco\/[A-Za-z0-9_-]{43}/.exec(href);
  expect(match, href).not.toBeNull();
  return match![0];
}

test('cancelar → ofertar a 2 → el primero acepta desde el móvil → agenda al día → el segundo ve «ocupado»', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await fillDate(page, 'Fecha', SLOT_DAY);
  await expect(page.getByTestId('day-column').first()).toBeVisible({ timeout: 15_000 });

  await column(page, dentist.fullName)
    .getByRole('button', { name: new RegExp(`10:00–10:30 · Gabi ${last}.*Detalle de la cita`) })
    .click();
  const detail = page.getByRole('dialog').filter({ hasText: 'Estado' });
  await chooseAppointmentStatus(detail.getByRole('combobox', { name: /^Estado: / }), 'Cancelada');
  await confirmCancellation(page, 'El paciente avisa', 'ILLNESS');
  await detail.getByRole('button', { name: 'Ocupar este hueco', exact: true }).click();

  const panel = page.getByTestId('fill-opening-panel');
  await expect(panel.getByTestId('opening-candidate')).toHaveCount(2, { timeout: 10_000 });
  await panel.getByRole('checkbox', { name: `Elegir a Ana ${last} para la oferta con enlace` }).check();
  await panel.getByRole('checkbox', { name: `Elegir a Carla ${last} para la oferta con enlace` }).check();
  await panel.getByRole('button', { name: 'Enviar oferta con enlace' }).click();

  const dialog = page.getByRole('dialog', { name: 'Enviar oferta con enlace' });
  await dialog.getByRole('radio', { name: /WhatsApp/ }).check();
  await dialog.getByRole('button', { name: 'Enviar oferta' }).click();
  const anaPath = await offerPath(
    dialog.getByRole('link', { name: `Abrir WhatsApp con la oferta para Ana ${last}` }),
  );
  const carlaPath = await offerPath(
    dialog.getByRole('link', { name: `Abrir WhatsApp con la oferta para Carla ${last}` }),
  );
  await dialog.getByRole('button', { name: 'Listo' }).click();
  await expect(panel.getByTestId('slot-link-offers')).toHaveText('Oferta enviada (2)', { timeout: 10_000 });

  // --- Ana, en su móvil y sin sesión, acepta ---
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await mobile.newPage();
  await phone.goto(`${origin}${anaPath}`);
  await expect(phone.getByText(/Hola Ana,/)).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText(dentist.fullName)).toBeVisible();
  // Sin apellidos ni nada clínico.
  await expect(phone.getByText(last)).toHaveCount(0);
  await expectNoHorizontalScroll(phone);
  await phone.getByRole('button', { name: 'Aceptar el hueco' }).click();
  await expect(phone.getByRole('heading', { name: 'Listo: el hueco es tuyo' })).toBeVisible();

  // --- Recepción lo ve sin recargar (sondeo) y la agenda se pone al día ---
  await expect(panel.getByTestId('slot-link-offers')).toHaveText(`Aceptado por Ana ${last}`, {
    timeout: 30_000,
  });
  await page.keyboard.press('Escape');
  await expect(
    column(page, dentist.fullName).getByRole('button', {
      name: new RegExp(`10:00–10:30 · Ana ${last}.*Detalle de la cita`),
    }),
  ).toBeVisible({ timeout: 15_000 });

  // --- Carla llega tarde ---
  await phone.goto(`${origin}${carlaPath}`);
  await expect(phone.getByRole('heading', { name: 'Este hueco ya se ocupó' })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByRole('button', { name: 'Aceptar el hueco' })).toHaveCount(0);
  await expectNoHorizontalScroll(phone);

  // 1440 px también: la misma página, sin scroll horizontal.
  await phone.setViewportSize({ width: 1440, height: 900 });
  await expectNoHorizontalScroll(phone);
  await mobile.close();
});
