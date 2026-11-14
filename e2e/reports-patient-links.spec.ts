import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { API_URL } from './support/urls';
import { atSede, sedeDayFromToday } from './support/clock';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';

/**
 * e2e DX-424 — «Reportes» → «Enlaces del paciente», sin mocks, en una clínica
 * nueva (sin los enlaces de otras suites): se manda un enlace de confirmación
 * de cita por la API y el informe del mes lo cuenta en su sede, con «—» en
 * abiertos y caducados sin abrir (la confirmación no registra la apertura).
 *  1. 1440 px: la tabla de la sede, un tipo por fila, y la leyenda del «—».
 *  2. 390 px: una tarjeta por tipo y ningún scroll horizontal.
 *  3. Un período sin envíos (mes anterior, en la URL): el vacío.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-enlaces-${suffix}`.slice(0, 40);
const email = `enlaces.${suffix}@example.com`;
const password = 'Password123!';

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let locationName: string;

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clinica Enlaces ${suffix}`,
    fullName: 'Dra. Enlaces Prueba',
    email,
    password,
  });
  const locations = (await (await request.get(`${API_URL}/locations`, { headers: session.headers })).json()) as {
    id: string;
    name: string;
  }[];
  locationName = locations[0].name;
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
  }[];
  // Sin horario: la cita se agenda a cualquier hora.
  await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Rosa',
    lastName: `Enlaces${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `ENL${suffix}`.slice(0, 20),
    sex: 'F',
    phone: '+58 414 555 0404',
  });
  const day = sedeDayFromToday(3);
  const appt = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId: staff[0].userId,
    start: atSede(day, '10:00').toISOString(),
    end: atSede(day, '10:30').toISOString(),
    reason: `Control ${suffix}`,
  });
  await apiPost(request, session, `/appointments/${appt.id}/confirmation-link`, {});
});

async function openTab(page: Page, query = ''): Promise<void> {
  await loginAs(page, session.origin, email, password);
  await page.goto(`${session.origin}/reportes?tab=enlaces-paciente${query}`);
  await expect(page.getByRole('tab', { name: 'Enlaces del paciente', selected: true })).toBeVisible();
}

test('1440 px: la confirmación enviada cuenta en su sede, con «—» donde no hay señal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTab(page);
  const table = page.getByRole('table', { name: `Uso de los enlaces del paciente: ${locationName}` });
  await expect(table).toBeVisible({ timeout: 30_000 });
  const rows = table.getByRole('row');
  await expect(rows).toHaveCount(6);
  const confirmation = rows.filter({ hasText: 'Confirmación de cita' });
  await expect(confirmation.getByRole('cell').nth(1)).toHaveText('1');
  await expect(confirmation.getByRole('cell').nth(2)).toHaveText('—');
  await expect(confirmation.getByRole('cell').nth(4)).toHaveText('—');
  await expect(page.getByTestId('patient-links-legend')).toContainText('la confirmación de cita no registra');
  // Sin datos de pacientes.
  await expect(page.getByRole('main')).not.toContainText('Rosa');
  await expectNoHorizontalScroll(page);
});

test('390 px: una tarjeta por tipo, sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTab(page);
  const list = page.getByRole('list', { name: `Uso de los enlaces del paciente: ${locationName}` });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await expect(list.getByRole('listitem').filter({ hasText: 'Confirmación de cita' })).toContainText('1 enviado');
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
});

test('un período sin envíos enseña el vacío', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTab(page, '&periodo=last_month');
  await expect(page.getByLabel('Enviados en')).toHaveValue('last_month');
  await expect(page.getByText('Sin enlaces enviados')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: /Uso de los enlaces del paciente/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});
