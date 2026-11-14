import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect, type Page } from './support/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { addDays, sedeDayFromToday } from './support/clock';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { fillDate, fillTime } from './support/dates';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-015 · Recall: el clínico fija el control en la ficha, recepción ve al
 * paciente vencido en «Mi día» y en /recall, registra «No contesta» (que queda
 * en el historial de la ficha) y le agenda una cita desde la lista: sale solo.
 * Una clínica por corrida y un paciente por ancho (1440 y 390).
 *
 * DX-015-bis-4: Control está enlazado al tipo de cita «Control periódico»
 * (45 min), que «Agendar» prellena. A 1440 se agenda desde «Agendar»; a 390,
 * desde «Registrar contacto» › «Agendó», con el canal y la nota, y el contacto
 * «Agendó» queda en el historial de la ficha.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `recall-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.rec.${suffix}@example.com` };
const reception = { fullName: 'Rita Mostrador', email: `rita.rec.${suffix}@example.com` };
const dentist = { fullName: 'Luis Sillón', email: `luis.rec.${suffix}@example.com` };
const lastControl = addDays(sedeDayFromToday(0), -240);

let session: ApiSession;
const patientIds: Record<string, string> = {};
const APPOINTMENT_TYPE = 'Control periódico';
let appointmentTypeId: string;

async function seedPatient(request: APIRequestContext, firstName: string, doc: string): Promise<string> {
  const { id } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName: `Recall${suffix}`.slice(0, 30),
    docType: 'NATIONAL_ID',
    docNumber: `${doc}${suffix}`.slice(0, 20),
    sex: 'F',
    phone: '+58 412 555 0177',
  });
  return id;
}

/** El clínico (ADMIN) fija el control desde la ficha. */
async function setRecallInRecord(page: Page, patientId: string): Promise<void> {
  await page.goto(`${origin}/patients/${patientId}?tab=data`);
  await page.getByRole('button', { name: 'Fijar recall de control' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Intervalo').selectOption('6');
  await fillDate(dialog, 'Fecha fijada a mano', lastControl);
  await dialog.getByRole('button', { name: 'Guardar recall' }).click();
  await expect(page.getByTestId('recall-row-CHECKUP')).toContainText('Por llamar');
}

async function receptionFlow(
  page: Page,
  firstName: string,
  width: number,
  day: string,
  via: 'schedule' | 'booked',
): Promise<void> {
  const fullName = `${firstName} Recall${suffix}`.slice(0, firstName.length + 1 + 30);
  await page.goto(`${origin}/dashboard`);
  await expect(page.getByTestId('pending-recall')).toBeVisible();
  await page.getByRole('link', { name: 'Recall por llamar' }).click();
  await expect(page).toHaveURL(/\/recall$/);
  await expect(page.getByRole('heading', { name: 'Recall', level: 1 })).toBeVisible();

  const list = dataList(page, 'Pacientes por llamar');
  const row = dataListRows(list).filter({ hasText: fullName });
  await expect(row).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'list', width);

  // «Llamado, no contesta»: sigue en la lista, con su último contacto.
  await rowAction(page, row, 'Registrar contacto');
  const contact = page.getByRole('dialog');
  await contact.getByLabel('Canal').selectOption('CALL');
  await contact.getByLabel('Resultado').selectOption('NO_ANSWER');
  await contact.getByLabel('Nota (opcional)').fill('Volver a llamar por la tarde');
  await expectDialogInsideViewport(page, contact);
  await shot(page, 'contact', width);
  await contact.getByRole('button', { name: 'Guardar contacto' }).click();
  await expect(page.getByText(`Contacto registrado para ${fullName}.`)).toBeVisible();
  await expect(row).toContainText('No contesta');

  if (via === 'booked') {
    // D23: «Agendó» no se guarda sin cita: abre «Agendar» con el canal y la nota.
    await rowAction(page, row, 'Registrar contacto');
    const booked = page.getByRole('dialog', { name: 'Registrar contacto' });
    await booked.getByLabel('Canal').selectOption('WHATSAPP_LINK');
    await booked.getByLabel('Resultado').selectOption('BOOKED');
    await booked.getByLabel('Nota (opcional)').fill('Prefiere la mañana');
    await booked.getByRole('button', { name: 'Agendar cita…' }).click();
    await expect(booked).toBeHidden();
    await expect(page.getByLabel('Contacto por')).toHaveValue('WHATSAPP_LINK');
    await expect(page.getByText('Nota del contacto: Prefiere la mañana')).toBeVisible();
  } else {
    await rowAction(page, row, 'Agendar');
    await expect(page.getByLabel('Contacto por')).toHaveValue('CALL');
  }

  // Agendar: el formulario llega con el paciente y el tipo de cita de Control
  // (D21); la hora de fin sale de su duración. Al crear la cita, sale.
  const form = page.getByRole('form', { name: 'Agendar cita' });
  await expect(form).toContainText(fullName);
  await expect(form.getByLabel('Motivo (opcional)')).toHaveValue('Recall: control');
  await expect(form.getByLabel('Tipo de cita (opcional)')).toHaveValue(appointmentTypeId);
  await form.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await fillDate(form, 'Fecha', day);
  await fillTime(form, 'Hora de inicio', '10:00');
  await shot(page, 'schedule', width);
  await form.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(page.getByText(`Cita agendada para ${fullName}: ya salió de la lista.`)).toBeVisible();
  await expect(dataListRows(list).filter({ hasText: fullName })).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Recall ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  // D20: Control agenda con «Control periódico» (una clínica nueva no trae tipos de cita).
  ({ id: appointmentTypeId } = await apiPost<{ id: string }>(request, session, '/appointment-types', {
    name: APPOINTMENT_TYPE,
    durationMinutes: 45,
    color: '#0E7490',
  }));
  const typesRes = await request.get(`${API_URL}/recall-types`, { headers: session.headers });
  expect(typesRes.ok(), await typesRes.text()).toBeTruthy();
  const control = ((await typesRes.json()) as { id: string; systemKey: string | null }[]).find(
    (t) => t.systemKey === 'CHECKUP',
  );
  const link = await request.patch(`${API_URL}/recall-types/${control!.id}`, {
    headers: session.headers,
    data: { appointmentTypeId },
  });
  expect(link.ok(), await link.text()).toBeTruthy();
  patientIds.Clara = await seedPatient(request, 'Clara', 'RA');
  patientIds.Marta = await seedPatient(request, 'Marta', 'RB');
});

test('el clínico fija el control en la ficha', async ({ page }) => {
  await loginAs(page, origin, admin.email, password);
  await setRecallInRecord(page, patientIds.Clara);
  await setRecallInRecord(page, patientIds.Marta);
  await shot(page, 'record', 1440);
});

test('recepción, 1440: vencido → contacto → agendar → sale de la lista', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await receptionFlow(page, 'Clara', 1440, sedeDayFromToday(3), 'schedule');
  await page.goto(`${origin}/patients/${patientIds.Clara}?tab=data`);
  const contacts = page.getByTestId('recall-contact-row');
  await expect(contacts.filter({ hasText: 'No contesta' })).toContainText('Control · Llamada · No contesta');
  await expect(contacts.filter({ hasText: 'No contesta' })).toContainText('Volver a llamar por la tarde');
  // D22: «Agendar» registró el contacto «Agendó» por Llamada (el canal por defecto).
  await expect(contacts.filter({ hasText: 'Agendó' })).toContainText('Control · Llamada · Agendó');
  await expect(page.getByTestId('recall-row-CHECKUP')).toContainText('Con cita');
});

test('recepción, 390: el mismo flujo en tarjetas, agendando desde «Agendó»', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await receptionFlow(page, 'Marta', 390, sedeDayFromToday(4), 'booked');
  await expect(page.getByText('Nadie pendiente de control')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'empty', 390);
  await page.goto(`${origin}/patients/${patientIds.Marta}?tab=data`);
  await page.getByTestId('patient-recall').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('recall-row-CHECKUP')).toContainText('Con cita');
  const booked = page.getByTestId('recall-contact-row').filter({ hasText: 'Agendó' });
  await expect(booked).toContainText('Control · WhatsApp · Agendó');
  await expect(booked).toContainText('Prefiere la mañana');
  await expectNoHorizontalScroll(page);
  await shot(page, 'record', 390);
});

test('un odontólogo que llega por URL ve el aviso, no la lista', async ({ page }) => {
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/recall`);
  await expect(page.getByText('Tu rol no tiene acceso a la lista de recall.')).toBeVisible();
});
