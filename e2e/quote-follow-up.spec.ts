import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { openSection } from './support/nav';
import { API_URL } from './support/urls';

/**
 * e2e DX-561 — Seguimiento automático de presupuestos presentados, sin mocks,
 * en una clínica nueva (una sede; la dueña ADMIN y una recepcionista):
 *  1. ADMIN entra por Ajustes › Presupuestos › «Configurar el seguimiento
 *     automático», activa la sede principal con 3/10/21 de 9 a 19 y persiste
 *     al recargar; días no crecientes → error junto a los días.
 *  2. Recepción no ve el seguimiento en Ajustes (ni la entrada ni la pantalla).
 *  3. En «Presupuestos por seguir», un presupuesto presentado hace 12 días
 *     muestra «Sin avisos» y recepción lo pausa y lo reanuda desde el «⋯»
 *     (1440 y 390 px, sin scroll horizontal). La presentación se fecha en el
 *     pasado con psql (no hay endpoint): sin E2E_DATABASE_URL se salta.
 *  4. El bloque «Seguimiento automático» aparece en Reportes › Presupuestos.
 * El envío real (barrido horario y job) lo prueba la API: aquí no se dispara.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
const subdomain = `seguimiento-${suffix}`;
const password = 'Password123!';
const admin = { fullName: 'Dra. Seguimiento Titular', email: `seg.${suffix}@example.com` };
const reception = { fullName: 'Rosa Recepción Seguimiento', email: `seg.rec.${suffix}@example.com` };
const LAST = `Seguimiento${suffix}`;

let session: ApiSession;
let catalogItemId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Seguimiento ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  catalogItemId = (
    await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `SEG-${suffix}`,
      kind: 'PROCEDURE',
      labelEs: `Corona ${suffix}`,
      color: '#3366CC',
      defaultPrice: 250,
    })
  ).id;
});

/** Un paciente con un presupuesto presentado (por la API). */
async function presentedPlan(page: Page, firstName: string): Promise<{ planId: string; name: string }> {
  const patient = await apiPost<{ id: string }>(page.request, session, '/patients', {
    firstName,
    lastName: LAST,
    docType: 'NATIONAL_ID',
    docNumber: `SEG${firstName}${suffix}`.slice(0, 20),
    sex: 'F',
    phone: '04125550177',
    countryCode: 'VE',
  });
  const plan = await apiPost<{ id: string }>(page.request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  await apiPost(page.request, session, `/treatment-plans/${plan.id}/items`, { toothNumber: '16', catalogItemId });
  await apiPost(page.request, session, `/treatment-plans/${plan.id}/present`, {});
  return { planId: plan.id, name: `${firstName} ${LAST}` };
}

test('ADMIN activa el seguimiento en la sede principal (3/10/21, de 9 a 19), persiste y valida junto al campo', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, session.origin, admin.email, password);
  await page.goto(`${session.origin}/settings/presupuestos`);
  await page.getByRole('link', { name: 'Configurar el seguimiento automático' }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(`${session.origin}/settings/presupuestos/seguimiento`);
  await expect(page.getByRole('heading', { level: 1, name: 'Seguimiento automático' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Qué lleva el aviso' })).toContainText('Sin importes ni tratamientos.');

  const table = page.getByRole('table', { name: 'Seguimiento automático por sede' });
  const row = table.getByRole('row', { name: /Sede principal/ });
  await expect(row).toContainText('Desactivado', { timeout: 15_000 });
  await row.getByRole('button', { name: 'Configurar el seguimiento de Sede principal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Seguimiento automático en Sede principal' });

  // Días no crecientes: el error va junto a los días y no se guarda.
  await dialog.getByLabel('Enviar avisos de seguimiento por email').check();
  const second = dialog.getByLabel('Aviso 2: días después', { exact: true });
  await second.fill('2');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Los días de los avisos van de menor a mayor y sin repetirse (por ejemplo, 3, 10 y 21).',
  );
  await expect(second).toHaveAttribute('aria-invalid', 'true');

  await second.fill('10');
  await expect(dialog.getByLabel('Aviso 1: días después', { exact: true })).toHaveValue('3');
  await expect(dialog.getByLabel('Aviso 3: días después', { exact: true })).toHaveValue('21');
  await dialog.getByLabel('De', { exact: true }).selectOption('9');
  await dialog.getByLabel('Hasta', { exact: true }).selectOption('19');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('Activo');
  await expect(row).toContainText('A los 3, 10 y 21 días');

  await page.reload();
  const reloaded = page.getByRole('table', { name: 'Seguimiento automático por sede' }).getByRole('row', { name: /Sede principal/ });
  await expect(reloaded).toContainText('Activo', { timeout: 15_000 });
  await expect(reloaded).toContainText('A los 3, 10 y 21 días');
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);

  const res = await page.request.get(`${API_URL}/quote-follow-up-settings`, { headers: session.headers });
  const [saved] = (await res.json()) as { enabled: boolean; offsetsDays: number[]; sendFromHour: number; sendUntilHour: number }[];
  expect(saved).toMatchObject({ enabled: true, offsetsDays: [3, 10, 21], sendFromHour: 9, sendUntilHour: 19 });

  // 390 px: la tarjeta de la sede y el modal caben sin scroll horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('list', { name: 'Seguimiento automático por sede' })).toContainText('Activo');
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
});

test('recepción no ve el seguimiento en Ajustes', async ({ page }) => {
  await loginAs(page, session.origin, reception.email, password);
  await page.goto(`${session.origin}/settings/presupuestos`);
  await expect(page.getByRole('heading', { level: 1, name: 'Presupuestos' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Configurar el seguimiento automático' })).toHaveCount(0);
  await page.goto(`${session.origin}/settings/presupuestos/seguimiento`);
  await expect(page.getByText('Solo administración configura el seguimiento automático.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('table', { name: 'Seguimiento automático por sede' })).toHaveCount(0);
});

for (const viewport of [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]) {
  test(`recepción ve «Sin avisos» en Presupuestos por seguir y pausa y reanuda el seguimiento (${viewport.name})`, async ({
    page,
  }) => {
    const databaseUrl = process.env.E2E_DATABASE_URL;
    test.skip(!databaseUrl, 'E2E_DATABASE_URL no definido: no se puede fechar la presentación en el pasado');
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const plan = await presentedPlan(page, `Paula${viewport.width}`);
    // Presentado hace 12 días: no hay endpoint para fechar en el pasado.
    execFileSync('psql', [
      databaseUrl as string,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `UPDATE treatment_plans SET "presentedAt" = now() - interval '12 days' WHERE id = '${plan.planId}'`,
    ]);

    await loginAs(page, session.origin, reception.email, password);
    await openSection(page, 'Presupuestos');
    await expect(page.getByRole('heading', { name: 'Presupuestos por seguir' })).toBeVisible({ timeout: 15_000 });
    const phone = viewport.width < 640;
    const list = phone
      ? page.getByRole('list', { name: 'Presupuestos presentados sin aceptar' })
      : page.getByRole('table', { name: 'Presupuestos presentados sin aceptar' });
    const row = list.getByRole(phone ? 'listitem' : 'row').filter({ hasText: plan.name });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    if (!phone) await expect(list.getByRole('columnheader', { name: 'Último aviso' })).toBeVisible();
    await expect(row.getByTestId('follow-up-status')).toHaveText('Sin avisos');
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page);

    await row.getByRole('button', { name: `Acciones de ${plan.name}` }).click();
    await page.getByRole('menuitem', { name: 'Pausar seguimiento' }).click();
    await expect(row.getByTestId('follow-up-status')).toHaveText('En pausa');
    await expect(page.getByText(`Seguimiento automático en pausa para ${plan.name}`, { exact: false })).toBeVisible();

    // Persistido: tras recargar sigue en pausa.
    await page.reload();
    const again = (phone
      ? page.getByRole('list', { name: 'Presupuestos presentados sin aceptar' })
      : page.getByRole('table', { name: 'Presupuestos presentados sin aceptar' })
    )
      .getByRole(phone ? 'listitem' : 'row')
      .filter({ hasText: plan.name });
    await expect(again.getByTestId('follow-up-status')).toHaveText('En pausa', { timeout: 15_000 });

    await again.getByRole('button', { name: `Acciones de ${plan.name}` }).click();
    await page.getByRole('menuitem', { name: 'Reanudar seguimiento' }).click();
    await expect(again.getByTestId('follow-up-status')).toHaveText('Sin avisos');
    await expectNoHorizontalScroll(page);
  });
}

test('el bloque «Seguimiento automático» aparece en Reportes › Presupuestos (1440 y 390 px)', async ({ page }) => {
  test.setTimeout(90_000);
  // Al menos una presentación para que el embudo no salga vacío.
  await presentedPlan(page, 'Rebeca');
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, session.origin, admin.email, password);
  await page.goto(`${session.origin}/reportes?tab=presupuestos`);
  await expect(page.getByRole('tab', { name: 'Presupuestos', selected: true })).toBeVisible({ timeout: 30_000 });
  const block = page.getByTestId('quote-follow-up-report');
  await expect(block.getByRole('heading', { name: 'Seguimiento automático' })).toBeVisible({ timeout: 30_000 });
  // Sin envíos (el barrido no corre en la e2e): su vacío, que dice dónde se activa.
  await expect(block).toContainText('Ningún aviso automático en el período', { timeout: 30_000 });
  await expect(block).toContainText('Ajustes › Presupuestos › Seguimiento automático');
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(block.getByRole('heading', { name: 'Seguimiento automático' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
});
