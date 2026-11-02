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
  await fillDate(dialog, 'Último control', lastControl);
  await dialog.getByRole('button', { name: 'Guardar recall' }).click();
  await expect(page.getByTestId('recall-row-CHECKUP')).toContainText('Por llamar');
}

async function receptionFlow(page: Page, firstName: string, width: number, day: string): Promise<void> {
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

  // Agendar: el formulario llega con el paciente y, al crear la cita, sale.
  await rowAction(page, row, 'Agendar');
  const form = page.getByRole('form', { name: 'Agendar cita' });
  await expect(form).toContainText(fullName);
  await expect(form.getByLabel('Motivo (opcional)')).toHaveValue('Recall: control');
  await form.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await fillDate(form, 'Fecha', day);
  await fillTime(form, 'Hora de inicio', '10:00');
  await fillTime(form, 'Hora de fin', '10:30');
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
  await receptionFlow(page, 'Clara', 1440, sedeDayFromToday(3));
  await page.goto(`${origin}/patients/${patientIds.Clara}?tab=data`);
  await expect(page.getByTestId('recall-contact-row')).toContainText('Control · Llamada · No contesta');
  await expect(page.getByTestId('recall-contact-row')).toContainText('Volver a llamar por la tarde');
  await expect(page.getByTestId('recall-row-CHECKUP')).toContainText('Con cita');
});

test('recepción, 390: el mismo flujo en tarjetas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await receptionFlow(page, 'Marta', 390, sedeDayFromToday(4));
  await expect(page.getByText('Nadie pendiente de control')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'empty', 390);
  await page.goto(`${origin}/patients/${patientIds.Marta}?tab=data`);
  await page.getByTestId('patient-recall').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('recall-row-CHECKUP')).toContainText('Con cita');
  await expectNoHorizontalScroll(page);
  await shot(page, 'record', 390);
});

test('un odontólogo que llega por URL ve el aviso, no la lista', async ({ page }) => {
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/recall`);
  await expect(page.getByText('Tu rol no tiene acceso a la lista de recall.')).toBeVisible();
});
