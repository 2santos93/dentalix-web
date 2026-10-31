import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { openSection } from './support/nav';

/**
 * e2e (DX-040): alternativas de plan (A/B), presentar, rechazar y
 * «Presupuestos por seguir».
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API):
 *   - el odontólogo crea una alternativa de un plan («Opción B»), compara las
 *     dos opciones lado a lado (total en COP, nº de procedimientos, estado),
 *     las presenta y acepta la A: la B queda «Rechazado» (otra opción aceptada);
 *   - la asistente ve el plan, pero no tiene «Presentar» ni «Aceptado»;
 *   - recepción entra en «Presupuestos por seguir» desde el menú, ve el grupo
 *     A/B de la demo (presentado hace 9 días, sin cita) con monto, días,
 *     teléfono y WhatsApp prellenado, y marca un presupuesto como rechazado
 *     con motivo: sale de la lista.
 * En escritorio (1440px) y en móvil (390px, sin scroll horizontal).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';
const ASSISTANT_EMAIL = process.env.E2E_DEMO_ASSISTANT_EMAIL ?? 'asistente@demo.dentalix.app';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
// Paciente de las opciones A/B de la demo (DEMO_PLAN_OPTIONS en la API).
const DEMO_OPTIONS_PATIENT = 'Carolina Duque Henao';

const IMPLANT = 3_500_000;

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

// Mismo formateador que la app; solo la cifra (entre ella y «COP» va un espacio duro).
const cop = new Intl.NumberFormat('es', { style: 'currency', currency: 'COP' });
function figure(amount: number): string {
  return cop.format(amount).split(/\s/)[0];
}

async function apiLogin(request: APIRequestContext, host: string, email: string): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `login ${email} falló: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Siembra como ADMIN un paciente con un plan en COP de un implante (y, si se pide, presentado). */
async function seed(
  request: APIRequestContext,
  origin: string,
  tag: string,
  { present = false }: { present?: boolean } = {},
): Promise<{ patientId: string; planId: string; fullName: string }> {
  const host = new URL(origin).host;
  const headers = {
    'X-Tenant-Host': host,
    Authorization: `Bearer ${await apiLogin(request, host, ADMIN_EMAIL)}`,
  };
  async function post<T>(path: string, data?: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const lastName = `Opciones${tag}`;
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Marta',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `DX40${tag}`.slice(0, 20),
    sex: 'F',
    phone: '3205550199',
    countryCode: 'CO',
  });
  const implant = await post<{ id: string }>('/catalog/items', {
    code: `dx40i-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Implante DX040 ${tag}`,
    color: '#3366CC',
    defaultPrice: IMPLANT,
  });
  const plan = await post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  await post(`/treatment-plans/${plan.id}/items`, { toothNumber: '46', catalogItemId: implant.id });
  if (present) await post(`/treatment-plans/${plan.id}/present`);
  return { patientId: patient.id, planId: plan.id, fullName: `Marta ${lastName}` };
}

async function webLogin(page: Page, origin: string, email: string): Promise<void> {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect
    .poll(async () => Boolean((await sessionCookie(page, origin))?.httpOnly), { timeout: 15_000 })
    .toBe(true);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`el odontólogo crea la opción B, compara, presenta y acepta la A: la B queda rechazada (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const data = await seed(page.request, origin, `${suffix}${viewport.width}`);

    await webLogin(page, origin, DENTIST_EMAIL);
    await page.goto(`${origin}/patients/${data.patientId}?tab=treatment-plans`);
    const panel = page.locator('#tabpanel-treatment-plans');

    // --- 1. Crear la alternativa (modal).
    await panel.getByRole('button', { name: 'Crear alternativa' }).click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Crear alternativa' });
    await expect(dialog.getByLabel('Nombre de la opción')).toHaveAttribute('placeholder', 'Opción B');
    await dialog.getByLabel('Nombre de la opción').fill('Opción B: puente');
    await dialog.getByRole('button', { name: 'Crear alternativa' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // La nueva queda abierta y el selector nombra las dos opciones.
    const planSelect = panel.getByLabel('Plan', { exact: true });
    await expect(planSelect.locator('option:checked')).toHaveText(/Opción B: puente$/, {
      timeout: 10_000,
    });

    // --- 2. Comparación lado a lado (cada total en su moneda).
    const comparison = panel.getByRole('region', { name: 'Comparar opciones' });
    const optionA = comparison.getByRole('listitem', { name: 'Opción A' });
    const optionB = comparison.getByRole('listitem', { name: 'Opción B: puente' });
    await expect(optionA).toContainText(figure(IMPLANT), { timeout: 10_000 });
    await expect(optionA).toContainText('1 procedimiento');
    await expect(optionB).toContainText(figure(IMPLANT));
    await expect(optionB).toHaveAttribute('aria-current', 'true');
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // --- 3. Presentar la B, abrir la A desde la comparación y presentarla.
    await panel.getByRole('button', { name: 'Presentar al paciente' }).click();
    await expect(panel.getByText(/^Presentado al paciente el /)).toBeVisible({ timeout: 10_000 });
    await optionA.getByRole('button', { name: 'Ver Opción A' }).click();
    await expect(planSelect.locator('option:checked')).toHaveText(/Opción A$/, { timeout: 10_000 });
    await panel.getByRole('button', { name: 'Presentar al paciente' }).click();
    await expect(panel.getByText(/^Presentado al paciente el /)).toBeVisible({ timeout: 10_000 });

    // --- 4. Aceptar la A: la B pasa a «Rechazado» en la misma operación.
    await panel.getByLabel('Estado del plan').selectOption('ACCEPTED');
    await expect(optionA.getByText('Aceptado')).toBeVisible({ timeout: 10_000 });
    await expect(optionB.getByText('Rechazado')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Crear alternativa' })).toHaveCount(0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // La B dice por qué.
    await optionB.getByRole('button', { name: 'Ver Opción B: puente' }).click();
    await expect(panel.getByText(/^Rechazado el .* · Aceptó otra opción$/)).toBeVisible({
      timeout: 10_000,
    });
  });
}

test('la asistente ve el plan pero no lo presenta ni lo acepta (la API: 403)', async ({ page }) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const host = new URL(origin).host;
  const data = await seed(page.request, origin, `${suffix}asis`);

  await webLogin(page, origin, ASSISTANT_EMAIL);
  await page.goto(`${origin}/patients/${data.patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  const status = panel.getByLabel('Estado del plan');
  await expect(status).toBeVisible({ timeout: 15_000 });
  await expect(status.locator('option')).toHaveText(['Borrador', 'Cancelado']);
  await expect(panel.getByRole('button', { name: 'Presentar al paciente' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Crear alternativa' })).toBeVisible();

  const token = await apiLogin(page.request, host, ASSISTANT_EMAIL);
  const present = await page.request.post(`${API_URL}/treatment-plans/${data.planId}/present`, {
    headers: { 'X-Tenant-Host': host, Authorization: `Bearer ${token}` },
  });
  expect(present.status()).toBe(403);
});

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`recepción sigue los presupuestos presentados y marca uno como rechazado (${viewport.name})`, async ({
    page,
  }) => {
    const databaseUrl = process.env.E2E_DATABASE_URL;
    test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede fechar la presentación en el pasado');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const data = await seed(page.request, origin, `${suffix}rec${viewport.width}`, { present: true });
    // Presentado hace 12 días: no hay endpoint para fechar en el pasado.
    execFileSync('psql', [
      databaseUrl as string,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `UPDATE treatment_plans SET "presentedAt" = now() - interval '12 days' WHERE id = '${data.planId}'`,
    ]);

    await webLogin(page, origin, RECEPTION_EMAIL);
    // Desde el menú: barra lateral en escritorio; en el teléfono la barra
    // inferior de recepción es Inicio, Agenda, Pacientes y Caja (I1), así que
    // Presupuestos está en la hoja «Más».
    await openSection(page, 'Presupuestos');
    await expect(page).toHaveURL(/\/presupuestos$/);
    await expect(page.getByRole('heading', { name: 'Presupuestos por seguir' })).toBeVisible();

    // UX v2 (`DataList`): tabla desde 640 px, tarjetas compactas en el teléfono.
    const phone = viewport.width < 640;
    const table = phone
      ? page.getByRole('list', { name: 'Presupuestos presentados sin aceptar' })
      : page.getByRole('table', { name: 'Presupuestos presentados sin aceptar' });
    const rowRole = phone ? 'listitem' : 'row';
    // El grupo A/B de la demo: dos filas del mismo paciente.
    const demoRows = table.getByRole(rowRole).filter({ hasText: DEMO_OPTIONS_PATIENT });
    await expect(demoRows).toHaveCount(2, { timeout: 15_000 });
    await expect(demoRows.filter({ hasText: 'Opción A: implante' })).toContainText(/hace [89] días/);
    await expect(
      demoRows.filter({ hasText: 'Opción B: puente fijo' }).getByRole('link', {
        name: `WhatsApp a ${DEMO_OPTIONS_PATIENT}`,
      }),
    ).toHaveAttribute('href', /^https:\/\/wa\.me\/573195550110\?text=Hola%20Carolina/);

    const row = table.getByRole(rowRole).filter({ hasText: data.fullName });
    await expect(row).toContainText(figure(IMPLANT));
    await expect(row).toContainText('hace 12 días');
    await expect(row.getByRole('link', { name: `WhatsApp a ${data.fullName}` })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/573205550199\?text=/,
    );
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // Marcar rechazado (modal con motivo): sale de la lista.
    // «Marcar rechazado» vive en el «⋯» de la fila.
    await row.getByRole('button', { name: `Acciones de ${data.fullName}` }).click();
    await page.getByRole('menuitem', { name: 'Marcar rechazado' }).click();
    const dialog = page.getByRole('dialog', { name: 'Marcar como rechazado' });
    await dialog.getByRole('button', { name: 'Marcar rechazado' }).click();
    await expect(dialog.getByText('Elige el motivo del rechazo.')).toBeVisible();
    await dialog.getByRole('radio', { name: 'Otro' }).check();
    await dialog.getByRole('button', { name: 'Marcar rechazado' }).click();
    await expect(
      dialog.getByText('Con el motivo «Otro» describe en la nota por qué lo rechazó.'),
    ).toBeVisible();
    await dialog.getByLabel('Nota').fill('Prefiere esperar a la prima de diciembre');
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Marcar rechazado' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('Presupuesto marcado como rechazado.')).toBeVisible();
    await expect(table.getByRole(rowRole).filter({ hasText: data.fullName })).toHaveCount(0);
  });
}

test('el odontólogo no ve «Presupuestos» en el menú y la API le responde 403', async ({ page }) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const host = new URL(origin).host;
  await webLogin(page, origin, DENTIST_EMAIL);
  await expect(page.getByRole('link', { name: 'Pacientes' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Presupuestos' })).toHaveCount(0);
  const token = await apiLogin(page.request, host, DENTIST_EMAIL);
  const res = await page.request.get(`${API_URL}/treatment-plans/pending-follow-up`, {
    headers: { 'X-Tenant-Host': host, Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(403);
});
