import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { fillDate, fillTime } from './support/dates';
import { loginAs } from './support/auth';
import { API_URL } from './support/urls';
import { addDays, sedeDayFromToday } from './support/clock';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { chooseAppointmentStatus } from './support/appointment-status';
import { shot } from './support/qa-shot';

/**
 * e2e DX-562 — citas en serie desde la agenda.
 *
 * 1. «Nueva cita» › «Repetir» cada 4 semanas × 6 › «Ver fechas»: la 2.ª fecha
 *    cae en un festivo de la sede y sale marcada con su razón; «Crear» no se
 *    puede hasta resolverla. «Omitir» › «Crear 5 citas» crea 5 citas, cada una
 *    con su posición en la serie (consultado por API) y «Serie · 1 de 5» en la
 *    agenda (el total es el de las citas creadas).
 * 2. Desde la 4.ª, «Cancelada» › «Esta y las siguientes»: se cancelan la 4.ª y
 *    la 5.ª; las anteriores siguen agendadas.
 *
 * A 1440 y 390 px, claro y oscuro (axe). Requiere la API y la web levantadas.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const DAY = sedeDayFromToday(2);
/** Las 6 fechas propuestas: cada 4 semanas desde DAY. */
const PROPOSED = Array.from({ length: 6 }, (_, k) => addDays(DAY, 28 * k));
const HOLIDAY = PROPOSED[1];

interface Clinic {
  session: ApiSession;
  email: string;
  fullName: string;
  docNumber: string;
  patientName: string;
}

async function newClinic(request: APIRequestContext, tag: string): Promise<Clinic> {
  const email = `dx562.${tag}.${suffix}@example.com`;
  const fullName = 'Dra. Serie Semanal';
  const session = await registerClinicViaApi(request, {
    subdomain: `test-dx562-${tag}-${suffix}`.slice(0, 40),
    clinicName: `Clinica Serie ${tag} ${suffix}`,
    fullName,
    email,
    password,
  });
  // Sin horario de atención: cualquier hora se puede agendar.
  await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  const locations = (await (await request.get(`${API_URL}/locations`, { headers: session.headers })).json()) as {
    id: string;
  }[];
  await apiPost(request, session, `/locations/${locations[0].id}/holidays`, {
    date: HOLIDAY,
    name: 'Carnaval',
    recurring: false,
  });
  const docNumber = `S${randomUUID().replace(/-/g, '')}`.slice(0, 20);
  const lastName = `Serie${suffix}`.slice(0, 30);
  await apiPost(request, session, '/patients', {
    firstName: 'Valeria',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber,
    sex: 'F',
    phone: '+58 414 555 0562',
  });
  return { session, email, fullName, docNumber, patientName: `Valeria ${lastName}` };
}

interface SeriesAppointment {
  id: string;
  start: string;
  status: string;
  series?: { id: string; index: number; total: number | null };
}

async function getAppointment(request: APIRequestContext, clinic: Clinic, id: string): Promise<SeriesAppointment> {
  const res = await request.get(`${API_URL}/appointments/${id}`, { headers: clinic.session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as SeriesAppointment;
}

/** El selector de estado visible de la cita de las 10:00 (en el teléfono, la tarjeta). */
function statusOf(page: Page) {
  return page
    .getByRole('combobox', { name: /^Estado de la cita de 10:00–10:30 de / })
    .filter({ visible: true })
    .first();
}

async function openDay(page: Page, day: string) {
  await fillDate(page, 'Fecha', day);
  await expect(statusOf(page)).toBeVisible({ timeout: 15_000 });
}

for (const width of [1440, 390] as const) {
  test(`${width} px: crear una serie cada 4 semanas omitiendo el festivo y cancelar «esta y las siguientes»`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    const clinic = await newClinic(request, `s${width}`);
    await loginAs(page, clinic.session.origin, clinic.email, password);
    await page.goto(`${clinic.session.origin}/agenda`);
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await fillDate(page, 'Fecha', DAY);

    // --- Paso 1: la cita base + «Repetir» ---
    await page.getByRole('button', { name: 'Nueva cita' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nueva cita' });
    const form = dialog.getByRole('form', { name: 'Agendar cita' });
    await form.getByLabel('Paciente', { exact: true }).fill(clinic.docNumber);
    await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
    await form.getByLabel('Profesional', { exact: true }).selectOption({ label: clinic.fullName });
    await fillTime(form, 'Hora de inicio', '10:00');
    await fillTime(form, 'Hora de fin', '10:30');
    const repeat = form.getByRole('checkbox', { name: /^Repetir/ });
    await expect(repeat).not.toBeChecked();
    await repeat.check();
    await form.getByLabel('Cada (semanas)', { exact: true }).fill('4');
    await form.getByLabel('Veces (incluida esta)', { exact: true }).fill('6');
    await expectNoHorizontalScroll(page);
    await shot(page, 'serie-repetir', width);
    await form.getByRole('button', { name: 'Ver fechas' }).click();

    // --- Paso 2: la vista previa en el mismo diálogo ---
    const preview = dialog.getByTestId('series-preview');
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.getByTestId('series-count')).toHaveText('6 citas');
    const holidayRow = preview.getByTestId('series-occurrence-2');
    await expect(holidayRow).toContainText('Choca');
    await expect(holidayRow).toContainText(/cerrada por festivo/);
    for (const i of [1, 3, 4, 5, 6]) await expect(preview.getByTestId(`series-occurrence-${i}`)).toContainText('Libre');
    await expect(preview.getByTestId('series-pending')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Crear 6 citas' })).toBeDisabled();
    await expectDialogInsideViewport(page, dialog);
    await expectNoHorizontalScroll(page);
    const violations = await axeInBothThemes(page, dialog, (scheme) => shot(page, `serie-vista-previa-${scheme}`, width));
    expect(violations.light, 'axe en claro').toEqual([]);
    expect(violations.dark, 'axe en oscuro').toEqual([]);

    await holidayRow.getByRole('button', { name: 'Omitir' }).click();
    await expect(holidayRow).toContainText('Omitida');
    await expect(preview.getByTestId('series-count')).toHaveText('5 citas');
    await expect(dialog.getByRole('checkbox', { name: /Avisar al paciente por email/ })).toBeChecked();
    const created = page.waitForResponse(
      (res) => res.request().method() === 'POST' && /\/appointments\/series$/.test(new URL(res.url()).pathname),
    );
    await dialog.getByRole('button', { name: 'Crear 5 citas' }).click();
    const createdRes = await created;
    expect(createdRes.status(), await createdRes.text()).toBe(201);
    const body = (await createdRes.json()) as { seriesId: string; appointments: SeriesAppointment[] };
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('Se crearon 5 citas en serie.')).toBeVisible();

    // Por API: 5 citas, en las fechas propuestas salvo el festivo, con su posición.
    expect(body.appointments).toHaveLength(5);
    const kept = [0, 2, 3, 4, 5].map((i) => PROPOSED[i]);
    const appointments = await Promise.all(body.appointments.map((a) => getAppointment(request, clinic, a.id)));
    appointments.forEach((a, i) => {
      expect(a.series).toEqual({ id: body.seriesId, index: i + 1, total: 5 });
      expect(a.status).toBe('SCHEDULED');
    });
    expect(appointments.map((a) => a.start.slice(0, 10))).toEqual(kept);

    // La agenda del primer día ya muestra la cita con su marca de serie.
    await expect(statusOf(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('series-chip').filter({ visible: true }).first()).toHaveText('Serie · 1 de 5');

    // --- Cancelar «esta y las siguientes» desde la 4.ª ---
    await openDay(page, kept[3]);
    await expect(page.getByTestId('series-chip').filter({ visible: true }).first()).toHaveText('Serie · 4 de 5');
    await chooseAppointmentStatus(statusOf(page), 'Cancelada');
    const cancel = page.getByRole('dialog', { name: /Cancelar la cita de/ });
    await expect(cancel.getByRole('radiogroup', { name: 'Qué citas cancelar' })).toBeVisible();
    await expect(cancel.getByLabel(/Solo esta cita/)).toBeChecked();
    await cancel.getByLabel(/Esta y las siguientes/).check();
    await cancel.getByLabel(/La clínica/).check();
    await expectDialogInsideViewport(page, cancel);
    const cancelViolations = await axeInBothThemes(page, cancel, (scheme) => shot(page, `serie-cancelar-${scheme}`, width));
    expect(cancelViolations.light, 'axe en claro').toEqual([]);
    expect(cancelViolations.dark, 'axe en oscuro').toEqual([]);
    await cancel.getByRole('button', { name: 'Cancelar esta y las siguientes' }).click();
    await expect(cancel).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('Se cancelaron 2 citas de la serie.')).toBeVisible();
    await expect(statusOf(page)).toHaveText('Cancelada', { timeout: 10_000 });

    const after = await Promise.all(body.appointments.map((a) => getAppointment(request, clinic, a.id)));
    expect(after.map((a) => a.status)).toEqual(['SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'CANCELLED', 'CANCELLED']);
    await expectNoHorizontalScroll(page);
  });
}
