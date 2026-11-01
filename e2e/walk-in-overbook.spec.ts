import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-509 y DX-510: urgencias de punta a punta contra la API real.
 *
 * Clínica nueva por corrida, sin horario de sede (cualquier hora vale) ni
 * huecos reservados: «Atender sin cita» siempre va en sobrecupo.
 * 1. DX-509: una urgencia en sobrecupo y, encima, una cita agendada del mismo
 *    profesional. «Deshacer llegada» pregunta («Su hora ya está ocupada») y
 *    «Mantener en sobrecupo» la deja agendada en sobrecupo: la agenda lo dice
 *    con «Sobrecupo». Movida a otra hora deja de serlo y el distintivo se va.
 * 2. DX-510: doble clic en «Atender en sobrecupo»: una sola cita (y, si el
 *    navegador llegó a mandar dos POST, con la misma Idempotency-Key).
 * Capturas de QA a 390/1440, claro y oscuro (DX509_QA_DIR o test-results).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `sobrecupo-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.ob.${suffix}@example.com` };
const dentist = { fullName: 'Óscar Urgencias', email: `oscar.ob.${suffix}@example.com` };
const reception = { fullName: 'Rosa Mostrador', email: `rosa.ob.${suffix}@example.com` };
const lastName = `Sobrecupo${suffix}`.slice(0, 40);

let session: ApiSession;
let dentistId: string;
let urgentId: string;
let bertaId: string;
let carlaId: string;

test.describe.configure({ mode: 'serial' });

async function apiCall<T>(
  request: APIRequestContext,
  method: 'get' | 'patch' | 'put',
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await request[method](`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `${method.toUpperCase()} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

function qaDir(testInfo: { outputPath: (p: string) => string }): string {
  return process.env.DX509_QA_DIR ?? testInfo.outputPath('qa');
}

/** Capturas a 390 y 1440, claro y oscuro, de lo que hay en pantalla. */
async function shoot(page: Page, dir: string, name: string, reopen: () => Promise<void>) {
  for (const width of [1440, 390]) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await reopen();
      await expectNoHorizontalScroll(page);
      // Sin la entrada del diálogo a medias en la captura.
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
      await page.screenshot({ path: `${dir}/${name}-${width}-${scheme}.png` });
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Sobrecupo ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  dentistId = (await apiCall<{ userId: string; fullName: string }[]>(request, 'get', '/staff')).find(
    (s) => s.fullName === dentist.fullName,
  )!.userId;
  // Sin horario de sede: la prueba no depende de la hora a la que corra.
  await apiCall(request, 'put', '/locations/schedule', { ranges: [] });
  await apiPost(request, session, '/appointment-types', {
    name: 'Consulta de urgencia',
    durationMinutes: 30,
    color: '#DC2626',
    isUrgent: true,
  });
  const patient = async (firstName: string) =>
    (
      await apiPost<{ id: string }>(request, session, '/patients', {
        firstName,
        lastName,
        docType: 'NATIONAL_ID',
        docNumber: `${firstName.slice(0, 2).toUpperCase()}${suffix}`.slice(0, 20),
        sex: 'F',
      })
    ).id;
  urgentId = await patient('Úrsula');
  bertaId = await patient('Berta');
  carlaId = await patient('Carla');
});

test('DX-509: deshacer la llegada con su hora ocupada pregunta; en sobrecupo la agenda lo dice y al moverla deja de serlo', async ({
  page,
  request,
}, testInfo) => {
  const walkIn = await apiPost<{ id: string; start: string; end: string; overbooked: boolean }>(
    request,
    session,
    '/appointments/walk-in',
    {
      patientId: urgentId,
      providerId: dentistId,
      triageFlags: ['PAIN'],
      overbookReason: 'Dolor agudo, no puede esperar',
    },
  );
  expect(walkIn.overbooked).toBe(true);
  // Mientras es sobrecupo, el hueco del profesional sigue libre: se agenda encima.
  const start = new Date(Math.max(Date.now(), new Date(walkIn.start).getTime()) + 5 * 60_000);
  await apiPost(request, session, '/appointments', {
    patientId: bertaId,
    providerId: dentistId,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda/en-clinica`);
  const row = page.getByTestId('in-clinic-item').filter({ hasText: `Úrsula ${lastName}` });
  await expect(row).toBeVisible({ timeout: 15_000 });

  const askToKeep = async () => {
    await page.goto(`${origin}/agenda/en-clinica`);
    await row.getByRole('button', { name: 'Deshacer llegada' }).click();
    await expect(page.getByRole('dialog', { name: 'Su hora ya está ocupada' })).toBeVisible();
  };
  await askToKeep();
  const dialog = page.getByRole('dialog', { name: 'Su hora ya está ocupada' });
  await expect(dialog).toContainText('su hora ya la ocupa otra cita del profesional');
  const dir = qaDir(testInfo);
  await shoot(page, dir, 'deshacer-llegada-dialogo', askToKeep);

  // «Volver» no cambia nada: sigue en espera.
  await dialog.getByRole('button', { name: 'Volver' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Deshacer llegada' }).click();
  await page.getByRole('dialog', { name: 'Su hora ya está ocupada' }).getByRole('button', { name: 'Mantener en sobrecupo' }).click();
  await expect(page.getByText(`Se deshizo la llegada de Úrsula ${lastName}. Sigue en sobrecupo.`)).toBeVisible();
  await expect(row).toHaveCount(0);
  const kept = await apiCall<{ status: string; overbooked: boolean }>(request, 'get', `/appointments/${walkIn.id}`);
  expect(kept).toMatchObject({ status: 'SCHEDULED', overbooked: true });

  // La agenda del día (lista) lo marca «Sobrecupo», y a la otra cita no.
  const dayList = async () => {
    await page.goto(`${origin}/agenda`);
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
  };
  await dayList();
  // La lista del día es tabla o tarjetas según el ancho.
  const entry = (name: string) => page.locator('tr, li').filter({ hasText: `${name} ${lastName}`, visible: true }).first();
  const urgentRow = entry('Úrsula');
  await expect(urgentRow.getByTestId('overbooked-chip')).toHaveText('Sobrecupo', { timeout: 15_000 });
  await expect(entry('Berta').getByTestId('overbooked-chip')).toHaveCount(0);
  await shoot(page, dir, 'agenda-sobrecupo', async () => {
    await dayList();
    await expect(urgentRow.getByTestId('overbooked-chip')).toBeVisible({ timeout: 15_000 });
  });

  // Movida a otra hora libre: cita normal (la API ya lo prueba a fondo) y
  // el distintivo se va.
  const later = new Date(start.getTime() + 2 * 60 * 60_000);
  const moved = await apiCall<{ overbooked: boolean }>(request, 'patch', `/appointments/${walkIn.id}`, {
    start: later.toISOString(),
    end: new Date(later.getTime() + 30 * 60_000).toISOString(),
  });
  expect(moved.overbooked).toBe(false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dayList();
  await expect(entry('Úrsula')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('overbooked-chip')).toHaveCount(0);
  await page.screenshot({ path: `${dir}/agenda-movida-sin-sobrecupo-1440-light.png` });
});

test('DX-510: doble clic en «Atender en sobrecupo» crea una sola cita', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  const posts: { key: string | null; status: number; id: string | null }[] = [];
  page.on('response', async (res) => {
    if (res.request().method() === 'POST' && res.url().endsWith('/appointments/walk-in')) {
      const body = (await res.json().catch(() => null)) as { id?: string } | null;
      posts.push({ key: res.request().headers()['idempotency-key'] ?? null, status: res.status(), id: body?.id ?? null });
    }
  });
  await page.goto(`${origin}/agenda/en-clinica`);
  await page.getByRole('button', { name: 'Atender sin cita' }).click();
  const dialog = page.getByRole('dialog', { name: 'Atender sin cita' });
  await dialog.getByLabel('Buscar paciente').fill(`Carla ${lastName}`.slice(0, 20));
  await dialog.getByRole('button', { name: new RegExp(`Carla ${lastName}`) }).click();
  await dialog.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();
  await dialog.getByLabel('Motivo del sobrecupo').fill('Traumatismo, no puede esperar');
  await dialog.getByRole('button', { name: 'Atender en sobrecupo' }).dblclick();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  await expect(page.getByTestId('in-clinic-item').filter({ hasText: `Carla ${lastName}` })).toHaveCount(1, {
    timeout: 15_000,
  });
  const created = posts.filter((p) => p.status === 201);
  expect(created.length).toBeGreaterThanOrEqual(1);
  expect(new Set(created.map((p) => p.id)).size).toBe(1);
  // El 409 del primer «Atender» y los envíos del sobrecupo: un solo intento.
  expect(new Set(posts.map((p) => p.key)).size).toBe(1);
  expect(posts[0].key).toMatch(/^[0-9a-f-]{36}$/);
  const list = await apiCall<{ patientId: string; status: string }[]>(
    request,
    'get',
    `/appointments?from=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
  );
  expect(list.filter((a) => a.patientId === carlaId)).toHaveLength(1);
});
