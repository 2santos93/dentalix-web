import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { openPatientTab } from './support/patient-tabs';
import { E2E_REGION } from './support/regional';
import { addDays, sedeDayFromToday } from './support/clock';
import { shot } from './support/qa-shot';
import { regionalFormat } from '../src/lib/format/regional-format';
import type { Locator, Page } from './support/test';

/**
 * e2e (DX-091): cierre contable de abonos y anulaciones, contra la API real.
 *
 * Registra una clínica (su dueño es ADMIN), siembra por la API un paciente con
 * un plan aceptado y un abono de hace 10 días, y comprueba:
 *   - Ajustes › Caja › «Cierre contable»: con 3 días abiertos, dice hasta qué
 *     día está cerrado (hoy − 4, el día de la sede);
 *   - Estado de cuenta: el abono de hace 10 días ofrece «Anular» deshabilitado
 *     con el porqué (ADMIN sin la exención);
 *   - «Registrar abono»: el campo de fecha explica el cierre y un día cerrado
 *     tecleado se dice junto al campo, sin llamar a la API;
 *   - con la exención activada, el ADMIN anula ese abono indicando el motivo
 *     de la excepción, que aparece luego en «Excepciones registradas».
 */
const API = API_URL;
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-fl-${suffix}`;
const email = `test.user.cierre.${suffix}@example.com`;
const password = 'Password123!';
const patientLastName = `Cierre${suffix}`;
const fmt = regionalFormat(E2E_REGION);

const TODAY = sedeDayFromToday(0, E2E_REGION.timeZone);
const PAID_ON = addDays(TODAY, -10);
const LOCKED_THROUGH = addDays(TODAY, -4);

const WIDTHS = [1440, 390] as const;

/**
 * Capturas de QA (solo con `E2E_QA_DIR`): a 1440 y 390 px, claro y oscuro.
 * `prepare` deja la pantalla lista en cada ancho (p. ej. abre el menú) y
 * devuelve lo que tiene que verse; `reset` lo deshace antes del siguiente.
 */
async function qaShots(
  page: Page,
  name: string,
  prepare: () => Promise<Locator | null>,
  reset?: () => Promise<void>,
): Promise<void> {
  if (!process.env.E2E_QA_DIR) return;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const target = await prepare();
    if (target) await target.scrollIntoViewIfNeeded();
    await shot(page, name, width);
    if (reset) await reset();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function seed(request: APIRequestContext, origin: string, accessToken: string): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': new URL(origin).host };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Luisa',
    lastName: patientLastName,
    docType: 'NATIONAL_ID',
    docNumber: `FL${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await post<{ id: string }>('/catalog/items', {
    code: `fl-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Resina-${suffix}`,
    color: '#3366CC',
    defaultPrice: 500,
  });
  const plan = await post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, { currency: 'USD' });
  const item = await post<{ id: string }>(`/treatment-plans/${plan.id}/items`, {
    toothNumber: '21',
    catalogItemId: catalog.id,
  });
  const accept = await request.patch(`${API}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok(), `Aceptar el ítem falló: ${await accept.text()}`).toBeTruthy();
  // Antes de configurar el cierre: el abono de hace 10 días entra.
  await post(`/treatment-plans/${plan.id}/payments`, {
    amount: 120,
    currency: 'USD',
    paidAt: PAID_ON,
    method: 'CASH',
  });
  return patient.id;
}

test('cierre contable: Ajustes, selector de fecha y anular con excepción del ADMIN', async ({ page }) => {
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Cierre ${suffix}`,
    fullName: 'Ana Admin',
    email,
    password,
  });
  const patientId = await seed(page.request, origin, await accessTokenOf(page));

  // --- Ajustes › Caja › Cierre contable ---
  await page.goto(`${origin}/settings/caja`);
  const section = page.getByRole('region', { name: 'Cierre contable' });
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(section.getByText('Ahora mismo no hay ningún día cerrado.')).toBeVisible();
  await expect(section.getByText('Todavía nadie ha hecho una operación en un período cerrado.')).toBeVisible();
  await section.getByLabel('Días abiertos hacia atrás').fill('3');
  await page.getByRole('button', { name: 'Guardar el cierre contable' }).click();
  await expect(
    section.getByText(`Ahora mismo está cerrado hasta el ${fmt.civilDate(LOCKED_THROUGH)}, inclusive.`),
  ).toBeVisible({ timeout: 10_000 });
  await qaShots(page, 'cierre-ajustes', async () => section);

  // --- Estado de cuenta: el abono cerrado no se anula (sin la exención) ---
  await page.goto(`${origin}/patients/${patientId}`);
  await openPatientTab(page, 'Estado de cuenta');
  const panel = page.locator('#tabpanel-account-statement');
  const actions = panel.getByRole('button', { name: /^Acciones de abono/ }).first();
  await expect(actions).toBeVisible({ timeout: 15_000 });
  await actions.click();
  const anular = page.getByRole('menuitem', { name: 'Anular' });
  await expect(anular).toHaveAttribute('aria-disabled', 'true');
  await expect(anular).toHaveAccessibleDescription(/período contable cerrado/);
  await page.keyboard.press('Escape');
  await qaShots(
    page,
    'anular-bloqueado',
    async () => {
      const trigger = panel.getByRole('button', { name: /^Acciones de abono/ }).first();
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await expect(anular).toBeVisible();
      return null;
    },
    () => page.keyboard.press('Escape'),
  );

  // --- «Registrar abono»: el campo de fecha explica el cierre ---
  await panel.getByRole('button', { name: 'Registrar abono' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(
    dialog.getByText(
      `Cierre contable: los días hasta el ${fmt.civilDate(LOCKED_THROUGH)} están cerrados y no admiten abonos.`,
    ),
  ).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel('Importe').fill('10');
  const [y, m, d] = LOCKED_THROUGH.split('-');
  const dateGroup = dialog.getByRole('group', { name: 'Fecha de pago' });
  await dateGroup.getByRole('spinbutton').first().click();
  // El orden de los segmentos lo da el formato de la sede (día, mes, año en es-*).
  await page.keyboard.type(`${d}${m}${y}`);
  await dialog.getByRole('button', { name: 'Registrar abono' }).click();
  await expect(dialog.getByText(/Esa fecha está en un período contable cerrado/)).toBeVisible();
  await qaShots(page, 'selector-fecha-error', async () => dialog.getByText(/Esa fecha está en un período contable cerrado/));
  await qaShots(
    page,
    'selector-fecha-calendario',
    async () => {
      await dateGroup.getByRole('button').click();
      await expect(page.getByRole('grid')).toBeVisible();
      return null;
    },
    () => page.keyboard.press('Escape'),
  );
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();

  // --- Con la exención, el ADMIN anula indicando el motivo ---
  await page.goto(`${origin}/settings/caja`);
  await expect(section).toBeVisible({ timeout: 15_000 });
  await section.getByRole('switch', { name: 'Administración puede hacerlo indicando el motivo' }).check();
  await page.getByRole('button', { name: 'Guardar el cierre contable' }).click();
  await expect(page.getByRole('region', { name: 'Cambios sin guardar' })).toBeHidden({ timeout: 10_000 });

  await page.goto(`${origin}/patients/${patientId}`);
  await openPatientTab(page, 'Estado de cuenta');
  await expect(actions).toBeVisible({ timeout: 15_000 });
  await actions.click();
  await page.getByRole('menuitem', { name: 'Anular' }).click();
  const voidDialog = page.getByRole('dialog', { name: /anular este abono/i });
  await expect(voidDialog).toContainText('Este abono es de un período contable cerrado');
  await voidDialog.getByLabel(/motivo de la anulación/i).fill('Cobro duplicado');
  await voidDialog.getByLabel('Motivo para anular en un período cerrado').fill('Duplicado confirmado con el banco');
  await qaShots(page, 'anular-excepcion', async () => voidDialog.getByLabel('Motivo para anular en un período cerrado'));
  await voidDialog.getByRole('button', { name: 'Anular abono' }).click();
  await expect(voidDialog).toBeHidden({ timeout: 10_000 });
  await expect(panel).toContainText('Anulado por Ana Admin: Cobro duplicado', { timeout: 10_000 });

  // --- La excepción queda en Ajustes ---
  await page.goto(`${origin}/settings/caja`);
  const overrides = section.getByRole('table', { name: 'Excepciones al cierre contable' });
  await expect(overrides).toBeVisible({ timeout: 15_000 });
  await expect(overrides).toContainText('Anuló un abono');
  await expect(overrides).toContainText('Ana Admin');
  await expect(overrides).toContainText(fmt.civilDate(PAID_ON));
  await expect(overrides).toContainText('Duplicado confirmado con el banco');
  await qaShots(page, 'cierre-excepciones', async () =>
    section.getByRole('heading', { name: 'Excepciones registradas' }),
  );
});
