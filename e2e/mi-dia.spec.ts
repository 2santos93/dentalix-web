import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';

/**
 * DX-503 · «Mi día»: el bloque «Pendientes» de Inicio, con los recuentos de
 * `GET /work-queues/summary` (una lectura, la misma que los contadores del
 * menú). Flujo: ADMIN ve sus listas con los números de la API, las que están
 * a 0 plegadas en «Al día» (se despliegan con teclado), una lista que falla
 * avisa en su fila con Reintentar y las demás siguen; recepción ve solo las
 * suyas; ⌘K «Mi día» lleva al bloque.
 */
const PASSWORD = 'Password123!';
const suffix = randomUUID().slice(0, 8);
const admin = { fullName: 'Dueña Mi Día', email: `midia.admin.${suffix}@example.com` };
const reception = { fullName: 'Recepción Mi Día', email: `midia.recepcion.${suffix}@example.com` };

let origin: string;
let session: ApiSession;

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext();
  try {
    session = await registerClinicViaApi(api, {
      subdomain: `midia-${suffix}`,
      clinicName: `Clínica Mi Día ${suffix}`,
      fullName: admin.fullName,
      email: admin.email,
      password: PASSWORD,
    });
    origin = session.origin;
    await addStaffViaApi(api, session, { ...reception, role: 'RECEPTION', password: PASSWORD });
    // Bajo stock: mínimo 5 y sin movimientos (existencias 0).
    await apiPost(api, session, '/inventory/items', { name: `Guantes ${suffix}`, unit: 'caja', minStock: 5 });
    // Lista de espera: dos pacientes.
    for (const n of [1, 2]) {
      const patient = await apiPost<{ id: string }>(api, session, '/patients', {
        firstName: 'Espera',
        lastName: `${n}-${suffix}`,
        docType: 'NATIONAL_ID',
        docNumber: `MIDIA${n}${suffix}`,
        sex: 'F',
      });
      await apiPost(api, session, '/waitlist', { patientId: patient.id });
    }
  } finally {
    await api.dispose();
  }
});

async function openInicio(page: Page, email: string) {
  await loginAs(page, origin, email, PASSWORD);
  await page.goto(`${origin}/dashboard`);
  const pending = page.getByRole('region', { name: 'Pendientes' });
  await expect(pending).toBeVisible({ timeout: 30_000 });
  return pending;
}

test('ADMIN: los números son los de la API, lo que está a 0 se pliega y cada fila abre su lista', async ({ page }) => {
  const pending = await openInicio(page, admin.email);
  await expect(pending.getByTestId('pending-low-stock-value')).toHaveText('1');
  await expect(pending.getByTestId('pending-waitlist-value')).toHaveText('2');

  // Los mismos números que la API para este rol (y nada más).
  const api = await page.request.get(`${API_URL}/work-queues/summary`, { headers: session.headers });
  const body = (await api.json()) as { items: { key: string; count: number }[] };
  expect(body.items.map((i) => i.key)).toEqual([
    'CLOSING_QUEUE',
    'ANAMNESIS_REVIEW',
    'QUOTE_FOLLOW_UP',
    'ACCEPTED_UNSCHEDULED',
    'WAITLIST',
    'RECEIVABLES',
    'LOW_STOCK',
  ]);
  const zero = body.items.filter((i) => i.count === 0).length;
  expect(zero).toBe(5);

  // Las listas a 0, plegadas; se despliegan con el teclado.
  const toggle = pending.getByRole('button', { name: /Al día: 5 listas/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(pending.getByTestId('pending-follow-up')).toBeHidden();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(pending.getByTestId('pending-follow-up-value')).toHaveText('Al día');

  // Cada fila abre su lista.
  await pending.getByRole('link', { name: 'Bajo stock' }).click();
  await expect(page).toHaveURL(/\/inventory$/);
});

test('DX-503-bis: al abrir Inicio sale UNA lectura de las listas (todas), no la del menú antes', async ({ page }) => {
  await loginAs(page, origin, admin.email, PASSWORD);
  const reads: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/work-queues/summary')) reads.push(req.url());
  });
  await page.goto(`${origin}/dashboard`);
  const pending = page.getByRole('region', { name: 'Pendientes' });
  await expect(pending.getByTestId('pending-low-stock-value')).toHaveText('1', { timeout: 30_000 });
  // Lo que tarde en llegar una segunda (el sondeo es de un minuto: no cuenta).
  await page.waitForLoadState('networkidle');
  expect(reads).toHaveLength(1);
  expect(reads[0]).not.toContain('keys=');
  // Fuera de Inicio, el menú vuelve a pedir solo sus listas.
  await page.getByRole('link', { name: 'Pacientes' }).first().click();
  await expect(page).toHaveURL(/\/patients/);
  await expect.poll(() => reads.length).toBeGreaterThan(1);
  expect(reads.at(-1)).toContain('keys=');
});

test('ADMIN: una lista que falla avisa en su fila con Reintentar y las demás siguen', async ({ page }) => {
  let broken = true;
  await page.route('**/work-queues/summary', async (route) => {
    const response = await route.fetch();
    const json = (await response.json()) as { items: { key: string; status: string; count: number | null }[] };
    if (broken) {
      json.items = json.items.map((i) => (i.key === 'WAITLIST' ? { ...i, status: 'ERROR', count: null } : i));
    }
    await route.fulfill({ response, json });
  });
  const pending = await openInicio(page, admin.email);
  const row = pending.getByTestId('pending-waitlist');
  await expect(row.getByText('No se pudo cargar')).toBeVisible();
  await expect(pending.getByTestId('pending-low-stock-value')).toHaveText('1');
  broken = false;
  await row.getByRole('button', { name: 'Volver a cargar «Pendientes por agendar»' }).click();
  await expect(pending.getByTestId('pending-waitlist-value')).toHaveText('2');
});

test('RECEPTION: solo sus listas (sin anamnesis ni bajo stock)', async ({ page }) => {
  const pending = await openInicio(page, reception.email);
  await expect(pending.getByTestId('pending-waitlist-value')).toHaveText('2');
  await expect(pending.getByTestId('pending-follow-up')).toHaveCount(1);
  await expect(pending.getByTestId('pending-low-stock')).toHaveCount(0);
  await expect(pending.getByTestId('pending-anamnesis')).toHaveCount(0);
});

test('⌘K «Mi día» lleva al bloque de pendientes de Inicio', async ({ page }) => {
  await loginAs(page, origin, reception.email, PASSWORD);
  await page.goto(`${origin}/patients`);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Control+k');
  const palette = page.getByTestId('command-palette');
  await palette.getByRole('combobox').fill('mi dia');
  await palette.getByRole('option', { name: /Mi día/ }).click();
  await expect(page).toHaveURL(/\/dashboard#pendientes$/);
  await expect(page.getByRole('region', { name: 'Pendientes' })).toBeInViewport();
});
