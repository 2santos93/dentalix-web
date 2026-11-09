import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { E2E_REGION } from './support/regional';
import { axeInBothThemes } from './support/axe';
import {
  expectDialogInsideViewport,
  expectNoHorizontalOverflowInDialog,
  expectNoHorizontalScroll,
} from './support/layout';
import { shot } from './support/qa-shot';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';
import { NO_CURRENCY_TEXTS } from '../src/lib/format/currency-text';

/**
 * e2e (DX-379, porción B): «Actualizar precios».
 *
 * En una clínica nueva: un procedimiento del catálogo a 100 USD, un plan
 * presentado con él; el catálogo sube a 120 por la API. En la ficha, a 390 px
 * (tarjetas) y a 1440 px (tabla), «Actualizar precios» enseña 100 → 120 y la
 * validez renovada, con axe limpio, el diálogo dentro de la pantalla y sin
 * desbordar en horizontal, en la vista previa y en la confirmación; a 1440 se
 * aplica: el plan cuesta 120 y la API guarda la validez nueva. Después, el
 * asistente dice que no hay precios que actualizar.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
const clinic = {
  subdomain: `test-clinic-recotizar-${suffix}`,
  clinicName: `Clínica Recotizar ${suffix}`,
  fullName: 'Dra. Recotizar',
  email: `recotizar.${suffix}@example.com`,
  password: 'Password123!',
};
const fmt = regionalFormat(E2E_REGION);
const usd = (amount: number) => moneyWithCode(amount, 'USD', fmt, NO_CURRENCY_TEXTS);
/** `Intl` separa con espacios duros: se compara con espacios normales. */
const norm = (text: string) => text.replace(/\s+/g, ' ').trim();

// El teléfono primero (se cancela), el escritorio después (se aplica).
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function apiPatch(request: APIRequestContext, s: ApiSession, path: string, body: object): Promise<void> {
  const res = await request.patch(`${API_URL}${path}`, { headers: s.headers, data: body });
  expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
}

interface StoredPlan {
  quoteValidUntil: string | null;
  quoteExpired: boolean;
  items: { price: number }[];
}

async function storedPlan(request: APIRequestContext, s: ApiSession, planId: string): Promise<StoredPlan> {
  const res = await request.get(`${API_URL}/treatment-plans/${planId}`, { headers: s.headers });
  expect(res.ok(), `GET del plan falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as StoredPlan;
}

test('el catálogo sube de 100 a 120 USD: «Actualizar precios» lo enseña, lo aplica y renueva la validez', async ({
  page,
  request,
}) => {
  const admin = await registerClinicViaApi(request, clinic);

  const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
    code: `rep-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Resina ${suffix}`,
    color: '#3366CC',
    defaultPrice: 100,
  });
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Ramón',
    lastName: `Recotizar${suffix}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX379B${suffix}`.slice(0, 20),
    sex: 'M',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, { toothNumber: '16', catalogItemId: catalog.id });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/present`, {});
  expect((await storedPlan(request, admin, plan.id)).items[0].price).toBe(100);

  // El precio vigente sube.
  await apiPatch(request, admin, `/catalog/items/${catalog.id}`, { defaultPrice: 120 });

  await loginAs(page, admin.origin, clinic.email, clinic.password);
  const panel = page.locator('#tabpanel-treatment-plans');
  const dialog = page.getByRole('dialog', { name: 'Actualizar precios' });

  async function expectDialogClean(width: number, what: string): Promise<void> {
    const found = await axeInBothThemes(page, dialog);
    expect(found.light, `axe de ${what} a ${width} px (claro)`).toEqual([]);
    expect(found.dark, `axe de ${what} a ${width} px (oscuro)`).toEqual([]);
    await expectNoHorizontalOverflowInDialog(dialog);
    await expectDialogInsideViewport(page, dialog);
    await expectNoHorizontalScroll(page);
  }

  // --- 1. 390 y 1440 px, ANTES de aplicar: vista previa 100 → 120 y confirmación.
  // A 390 px se cancela; a 1440 px se aplica.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
    await panel.getByRole('button', { name: 'Actualizar precios' }).click({ timeout: 15_000 });

    // En el teléfono, la lista son tarjetas (`ul`); desde 640 px, una tabla.
    const phone = viewport.width < 640;
    const lines = phone
      ? dialog.getByRole('list', { name: 'Procedimientos a actualizar' })
      : dialog.getByRole('table', { name: 'Procedimientos a actualizar' });
    const line = phone
      ? lines.getByRole('listitem').filter({ hasText: `Resina ${suffix}` })
      : lines.getByRole('row', { name: new RegExp(`Resina ${suffix}`) });
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole(phone ? 'table' : 'list', { name: 'Procedimientos a actualizar' })).toHaveCount(0);
    const lineText = norm((await line.textContent()) ?? '');
    expect(lineText).toContain(norm(usd(100)));
    expect(lineText).toContain(norm(usd(120)));
    expect(lineText).toContain(norm(`Sube ${usd(20)}`));
    const box = line.getByRole('checkbox', { name: new RegExp(`Actualizar Resina ${suffix}`) });
    await expect(box).toBeChecked();
    // I-4: el blanco táctil de la casilla (su etiqueta) mide al menos 44 px.
    const target = await line.getByTestId('reprice-line-select').boundingBox();
    expect(target?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(target?.width ?? 0).toBeGreaterThanOrEqual(44);
    await expect(dialog.getByTestId('reprice-validity')).toContainText('La validez se renueva hasta el');
    await expectDialogClean(viewport.width, 'la vista previa');
    await shot(page, 'dx379b-preview', viewport.width);

    await dialog.getByRole('button', { name: 'Continuar' }).click();
    const summary = dialog.getByRole('region', { name: 'Resumen de la actualización' });
    await expect(summary).toContainText('1 procedimiento');
    expect(norm((await summary.textContent()) ?? '')).toContain(norm(`Sube ${usd(20)}`));
    await expectDialogClean(viewport.width, 'la confirmación');
    await shot(page, 'dx379b-confirm', viewport.width);

    if (phone) {
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();
      continue;
    }
    // --- 2. Aplicar (1440 px).
    const apply = dialog.getByRole('button', { name: 'Actualizar precios' });
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('Precios actualizados')).toBeVisible();
  }

  // El plan cuesta 120 y la validez guardada es la renovada.
  const after = await storedPlan(request, admin, plan.id);
  expect(after.items[0].price).toBe(120);
  expect(after.quoteExpired).toBe(false);
  expect(after.quoteValidUntil).not.toBeNull();
  const until = fmt.civilDate(after.quoteValidUntil!);
  await expect(panel.getByTestId('tp-plan-status-line').getByTestId('quote-valid-until')).toHaveText(
    `Válido hasta el ${until}`,
    { timeout: 15_000 },
  );
  await expect
    .poll(async () => norm((await panel.textContent()) ?? ''), { timeout: 15_000 })
    .toContain(norm(usd(120)));

  // --- 3. Ya aplicado, a 390 px: nada que actualizar en un plan vigente.
  await page.setViewportSize(VIEWPORTS[1]);
  await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
  await panel.getByRole('button', { name: 'Actualizar precios' }).click({ timeout: 15_000 });
  await expect(dialog.getByText('No hay precios que actualizar.')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await expectNoHorizontalOverflowInDialog(dialog);
  await shot(page, 'dx379b-after', VIEWPORTS[1].width);
});
