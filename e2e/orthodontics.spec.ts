import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { SEDE_TODAY_TZ, lastSlotToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_TODAY_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-190: caso de ortodoncia, control desde la cita y lista de seguimiento.
 *
 * Una clínica nueva (sede sin horario) con la ortodoncia activada, una
 * odontóloga y recepción; una paciente con una cita hoy al final del día.
 *   1. 1440 px: la odontóloga abre «Ortodoncia» en la ficha (vacío «Este
 *      paciente no tiene caso de ortodoncia»), crea el caso de 24 meses y 24
 *      controles y registra el primer control desde la cita (el atajo del panel
 *      de la cita); la barra marca 1/24 y el arco actual es el del control.
 *   2. 390 px: el formulario de control (con el arco anterior puesto) y la
 *      pestaña sin scroll horizontal, en claro y oscuro.
 *   3. Recepción ve Pacientes › Ortodoncia a 1440 y 390 px con la paciente
 *      (tiene cita: «Al día»), sin «Ortodoncia» en la ficha.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `orto-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Sara Titular', email: `sara.orto.${suffix}@example.com` };
const dentist = { fullName: 'Lina Ortodoncia', email: `lina.orto.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.orto.${suffix}@example.com` };
const lastName = `Orto${suffix}`.slice(0, 40);
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

test.use({ timezoneId: SEDE_TODAY_TZ });
test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let patientId: string;
let appointmentId: string;

/** Sin scroll horizontal a 1440 y 390 px y, con E2E_QA_DIR, la captura en claro y oscuro. */
async function checkViewports(page: Page, name: string): Promise<void> {
  if (QA_DIR) mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalScroll(page);
    if (!QA_DIR) continue;
    await page.mouse.move(0, 0);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png` });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Ortodoncia ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  expect(schedule.ok()).toBeTruthy();
  const settings = await request.put(`${API_URL}/ortho/settings`, { headers: session.headers, data: { enabled: true } });
  expect(settings.ok(), await settings.text()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const lina = members.find((m) => m.fullName === dentist.fullName)!.userId;
  patientId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Valentina',
      lastName,
      docType: 'NATIONAL_ID',
      docNumber: `ORT${suffix}`.slice(0, 20),
      sex: 'F',
      phone: '+584121234567',
    })
  ).id;
  const slot = lastSlotToday('23:50', '23:59', SEDE_TODAY_TZ);
  appointmentId = (
    await apiPost<{ id: string }>(request, session, '/appointments', {
      patientId,
      providerId: lina,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      reason: 'Control de ortodoncia',
    })
  ).id;
});

test('la odontóloga crea el caso y registra el control desde la cita (1440 y 390)', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=ortho`);
  const panel = page.locator('#tabpanel-ortho');
  await expect(panel.getByText('Este paciente no tiene caso de ortodoncia')).toBeVisible({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Crear caso' }).click();
  const caseDialog = page.getByRole('dialog', { name: 'Crear caso de ortodoncia' });
  await expect(caseDialog.getByLabel('Duración estimada (meses)')).toHaveValue('24');
  await expect(caseDialog.getByLabel('Controles previstos')).toHaveValue('24');
  await caseDialog.getByRole('button', { name: 'Crear caso' }).click();
  await expect(caseDialog).toBeHidden();
  await expect(panel.getByText(/0\/24 controles/)).toBeVisible();

  // El atajo del panel de la cita («Registrar control de ortodoncia»).
  await page.goto(`${origin}/patients/${patientId}?tab=ortho&orthoVisitAppointment=${appointmentId}`);
  const visit = page.getByRole('dialog', { name: 'Registrar control' });
  await expect(visit.getByText(/Se registra en la cita de hoy/)).toBeVisible({ timeout: 15_000 });
  const material = visit.getByRole('combobox', { name: 'Material' });
  await material.first().selectOption('NITI');
  await visit.getByRole('combobox', { name: 'Calibre' }).first().selectOption('0.016');
  await visit.getByRole('combobox', { name: 'Índice de higiene' }).selectOption('2');
  await visit.getByRole('button', { name: 'Guardar control' }).click();
  await expect(visit).toBeHidden();
  await expect(page).not.toHaveURL(/orthoVisitAppointment/);
  await expect(panel.getByRole('progressbar', { name: 'Controles realizados' })).toHaveAttribute('aria-valuenow', '1');
  await expect(panel.getByText('Superior: NiTi 0.016')).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Historial de controles' }).getByText(/Control 1 ·/)).toBeVisible();
  await checkViewports(page, 'ortho-tab');

  // El formulario a 390: el arco anterior ya puesto y sin scroll horizontal.
  await page.setViewportSize(VIEWPORTS[1]);
  await panel.getByRole('button', { name: 'Registrar control' }).click();
  await expect(visit.getByRole('combobox', { name: 'Calibre' }).first()).toHaveValue('0.016');
  await checkViewports(page, 'ortho-visit-form');
  await visit.getByRole('button', { name: 'Cancelar' }).click();
});

test('recepción ve la lista de ortodoncia y no la pestaña clínica (1440 y 390)', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients`);
  await page.getByRole('link', { name: 'Ortodoncia: pacientes atrasados o sin próxima cita' }).click();
  await expect(page.getByRole('heading', { name: 'Ortodoncia', level: 1 })).toBeVisible();
  const list = page.getByRole('table', { name: 'Casos de ortodoncia activos' });
  await expect(list.getByText(`Valentina ${lastName}`)).toBeVisible({ timeout: 15_000 });
  await expect(list.getByText('Al día')).toBeVisible();
  await page.getByRole('radio', { name: 'Atrasados' }).click();
  await expect(page.getByText('No hay pacientes atrasados')).toBeVisible();
  await page.getByRole('radio', { name: 'Todos' }).click();
  await expect(list.getByText(`Valentina ${lastName}`)).toBeVisible();
  await checkViewports(page, 'ortho-follow-up');

  await page.goto(`${origin}/patients/${patientId}`);
  await expect(page.getByRole('tab', { name: 'Datos' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('tab', { name: 'Ortodoncia' })).toHaveCount(0);
});
