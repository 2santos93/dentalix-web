import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { E2E_REGION } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-546 (FE-112, FE-113, FE-115): los modales de equipos biomédicos.
 *
 * Una clínica nueva por corrida con una segunda sede en EUR («Sede Cerrada»),
 * un equipo en ella con un mantenimiento anulado, y la sede desactivada
 * después. Con «Todas las sedes», a 1440 px y a 390 px:
 * - «Nuevo equipo» sin nombre: el foco va a «Nombre» (FE-113);
 * - el equipo de la sede cerrada: «Editar» muestra su sede «(inactiva)» con
 *   el aviso; «Registrar mantenimiento» parte de su «hoy» y de su moneda; sin
 *   descripción, el foco va a «Qué se hizo» (FE-112, FE-113);
 * - el mantenimiento anulado es el Badge neutro «Anulado» (FE-115).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `equipos-a11y-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.equipos.${suffix}@example.com`;
const CLOSED = 'Sede Cerrada';
const EQUIPMENT = 'Autoclave de la sede cerrada';

let session: ApiSession;
let equipmentId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Equipos ${suffix}`,
    fullName: 'Elena Equipos',
    email: adminEmail,
    password,
  });
  const closed = await createLocationViaApi(request, session, { name: CLOSED, ...E2E_REGION, currency: 'EUR' });
  equipmentId = (
    await apiPost<{ id: string }>(request, session, '/equipment', {
      locationId: closed,
      name: EQUIPMENT,
      category: 'AUTOCLAVE',
    })
  ).id;
  const maintenance = await apiPost<{ id: string }>(request, session, `/equipment/${equipmentId}/maintenances`, {
    kind: 'CORRECTIVE',
    performedOn: sedeDayFromToday(-1),
    description: 'Cargado por error',
  });
  await apiPost(request, session, `/equipment/${equipmentId}/maintenances/${maintenance.id}/void`, {
    reason: 'Equipo equivocado',
  });
  const off = await request.patch(`${API_URL}/locations/${closed}`, {
    headers: session.headers,
    data: { isActive: false },
  });
  expect(off.ok(), `desactivar la sede falló: ${await off.text()}`).toBeTruthy();
});

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** id del elemento con el foco. */
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');

for (const width of [1440, 390] as const) {
  test(`modales de equipos: foco en el error y la sede desactivada del equipo (${width}px)`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await loginAs(page, origin, adminEmail, password);
    await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));

    // --- FE-113: «Nuevo equipo» sin nombre ---
    await page.goto(`${origin}/settings/equipos`);
    await expect(page.getByRole('heading', { level: 1, name: 'Equipos biomédicos' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: EQUIPMENT }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Nuevo equipo' }).click();
    const create = page.getByRole('dialog', { name: 'Nuevo equipo' });
    await expectDialogInsideViewport(page, create);
    // Para elegir, solo las sedes activas.
    await expect(create.getByLabel('Sede', { exact: true }).locator('option', { hasText: CLOSED })).toHaveCount(0);
    await create.getByRole('button', { name: 'Crear equipo' }).click();
    await expect(create.getByText('Escribe el nombre del equipo (hasta 120 caracteres).')).toBeVisible();
    await expect.poll(() => focusedId(page)).toBe('equipment-name');
    await expect(create.getByLabel('Nombre')).toBeInViewport();
    await shot(page, 'DX-546-equipo-error-nombre', width);
    await create.getByRole('button', { name: 'Cancelar' }).click();
    await expect(create).toBeHidden();

    // --- Hoja de vida del equipo de la sede cerrada ---
    await page.goto(`${origin}/settings/equipos/${equipmentId}`);
    await expect(page.getByRole('heading', { name: EQUIPMENT })).toBeVisible({ timeout: 15_000 });

    // FE-115: el anulado es el Badge neutro, no un chip rojo en mayúsculas.
    const voided = page.getByTestId('life-sheet-maintenance').filter({ hasText: 'Cargado por error' });
    const badge = voided.locator('[data-status="VOIDED"]');
    await expect(badge).toHaveText('Anulado');
    await expect(voided.getByText('ANULADO', { exact: true })).toHaveCount(0);
    await badge.scrollIntoViewIfNeeded();
    await expectNoHorizontalScroll(page);
    await shot(page, 'DX-546-hoja-de-vida-anulado', width);

    // FE-112: «Editar» muestra la sede real del equipo, marcada, con el aviso.
    await page.getByRole('button', { name: 'Editar' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar equipo' });
    const sede = edit.getByLabel('Sede', { exact: true });
    await expect(sede.locator('option:checked')).toHaveText(`${CLOSED} (inactiva)`);
    await expect(edit.getByText('Esta sede está desactivada. Elige una sede activa para reubicar el equipo.')).toBeVisible();
    await shot(page, 'DX-546-editar-sede-inactiva', width);
    await edit.getByRole('button', { name: 'Cancelar' }).click();
    await expect(edit).toBeHidden();

    // FE-112 + FE-113: el mantenimiento con el «hoy» y la moneda de la sede cerrada.
    await page.getByRole('button', { name: 'Registrar mantenimiento' }).click();
    const record = page.getByRole('dialog', { name: 'Registrar mantenimiento' });
    await expectDialogInsideViewport(page, record);
    await expect(record.locator('input[name="performedOn"]')).toHaveValue(sedeDayFromToday(0), { timeout: 10_000 });
    await expect(record.getByLabel('Moneda')).toHaveValue('EUR');
    await record.getByRole('button', { name: 'Registrar mantenimiento' }).click();
    await expect(record.getByText('Describe qué se hizo (hasta 2000 caracteres).')).toBeVisible();
    await expect.poll(() => focusedId(page)).toBe('maintenance-description');
    await expect(record.getByLabel('Qué se hizo')).toBeInViewport();
    await shot(page, 'DX-546-mantenimiento-error', width);
    await record.getByRole('button', { name: 'Cancelar' }).click();

    expect(errors, 'errores de consola').toEqual([]);
  });
}
