import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { SEDE_TODAY_TZ, lastSlotToday } from './support/clock';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { E2E_TODAY_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-015-bis (D17 + D15) · «Sin recall configurado»: un paciente atendido
 * hoy, sin recall ni cita, sale en la segunda vista de /recall. Recepción le
 * programa el recall de un tipo (con su intervalo por defecto) desde la fila:
 * sale de la lista, la vista queda vacía y la ficha muestra el recall.
 *
 * La cita es de HOY en `SEDE_TODAY_TZ` (la API rechaza agendar en el pasado) y
 * se lleva a COMPLETED por la API: llegada, sillón, lista para cobrar, atendida.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `sinrecall-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.sr.${suffix}@example.com` };
const reception = { fullName: 'Rita Mostrador', email: `rita.sr.${suffix}@example.com` };
const dentist = { fullName: 'Luis Sillón', email: `luis.sr.${suffix}@example.com` };
const lastName = `SinRecall${suffix}`.slice(0, 30);
const fullName = `Elena ${lastName}`;

let session: ApiSession;
let patientId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Sin Recall ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const providerId = members.find((m) => m.fullName === dentist.fullName)!.userId;

  ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Elena',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `SR${suffix}`.slice(0, 20),
    sex: 'F',
    phone: '+58 412 555 0188',
  }));
  const slot = lastSlotToday('23:50', '23:55', SEDE_TODAY_TZ);
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId,
    providerId,
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    reason: 'Limpieza',
  });
  for (const status of ['ARRIVED', 'IN_CHAIR', 'READY_FOR_CHECKOUT', 'COMPLETED']) {
    const res = await request.patch(`${API_URL}/appointments/${appointment.id}`, {
      headers: session.headers,
      data: { status },
    });
    expect(res.ok(), `${status}: ${await res.text()}`).toBeTruthy();
  }
});

test('recepción, 1440: «Sin recall configurado» → «Programar recall» → sale de la lista', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/recall`);
  await expect(page.getByRole('heading', { name: 'Recall', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'Sin recall configurado' }).click();

  const list = dataList(page, 'Pacientes sin recall configurado');
  const row = dataListRows(list).filter({ hasText: fullName });
  await expect(row).toBeVisible();
  await expect(row).toContainText('+58 412 555 0188');
  await expectNoHorizontalScroll(page);
  await shot(page, 'unconfigured', 1440);

  await rowAction(page, row, 'Programar recall');
  const dialog = page.getByRole('dialog', { name: `Programar recall de ${fullName}` });
  await expect(dialog.getByLabel('Tipo de recall')).toBeVisible();
  // La opción dice el intervalo por defecto del tipo («Control · cada 12 meses»).
  const control = await dialog.getByRole('option', { name: /^Control · cada \d+ mes/ }).getAttribute('value');
  await dialog.getByLabel('Tipo de recall').selectOption(control!);
  await expectDialogInsideViewport(page, dialog);
  await shot(page, 'unconfigured-dialog', 1440);
  await dialog.getByRole('button', { name: 'Programar recall', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Recall de Control programado para ${fullName}: ya salió de la lista.`)).toBeVisible();
  await expect(page.getByText('Todos los pacientes atendidos tienen recall')).toBeVisible();

  await page.goto(`${origin}/patients/${patientId}?tab=data`);
  await expect(page.getByTestId('recall-row-CHECKUP')).toContainText('Vence el');
});

test('390: la vista vacía en tarjetas, sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/recall`);
  await page.getByRole('radio', { name: 'Sin recall configurado' }).click();
  await expect(page.getByText('Todos los pacientes atendidos tienen recall')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'unconfigured-empty', 390);
});
