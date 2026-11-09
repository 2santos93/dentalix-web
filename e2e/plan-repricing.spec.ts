import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { E2E_REGION } from './support/regional';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';
import { NO_CURRENCY_TEXTS } from '../src/lib/format/currency-text';

/**
 * e2e (DX-379, porción B): «Actualizar precios».
 *
 * En una clínica nueva: un procedimiento del catálogo a 100 USD, un plan
 * presentado con él; el catálogo sube a 120 por la API. En la ficha,
 * «Actualizar precios» enseña 100 → 120 y la validez renovada; al aplicar, el
 * plan cuesta 120 y la API guarda la validez nueva. axe limpio en el asistente
 * y nada se desplaza en horizontal; capturas a 1440 y 390 px.
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

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
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
  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  await panel.getByRole('button', { name: 'Actualizar precios' }).click({ timeout: 15_000 });

  // --- Paso 1: vista previa 100 → 120 y la validez renovada.
  const dialog = page.getByRole('dialog', { name: 'Actualizar precios' });
  const lines = dialog.getByRole('table', { name: 'Procedimientos a actualizar' });
  const row = lines.getByRole('row', { name: new RegExp(`Resina ${suffix}`) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  const rowText = norm((await row.textContent()) ?? '');
  expect(rowText).toContain(norm(usd(100)));
  expect(rowText).toContain(norm(usd(120)));
  expect(rowText).toContain(norm(`Sube ${usd(20)}`));
  await expect(dialog.getByTestId('reprice-validity')).toContainText('La validez se renueva hasta el');
  const previewAxe = await axeInBothThemes(page, dialog);
  expect(previewAxe.light, 'axe de la vista previa (claro)').toEqual([]);
  expect(previewAxe.dark, 'axe de la vista previa (oscuro)').toEqual([]);
  await expectNoHorizontalScroll(page);
  await shot(page, 'dx379b-preview', VIEWPORTS[0].width);

  // --- Paso 2: confirmar y aplicar.
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  const summary = dialog.getByRole('region', { name: 'Resumen de la actualización' });
  await expect(summary).toContainText('1 procedimiento');
  const confirmAxe = await axeInBothThemes(page, dialog);
  expect(confirmAxe.light, 'axe de la confirmación (claro)').toEqual([]);
  expect(confirmAxe.dark, 'axe de la confirmación (oscuro)').toEqual([]);
  await shot(page, 'dx379b-confirm', VIEWPORTS[0].width);
  await dialog.getByRole('button', { name: 'Actualizar precios' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('Precios actualizados')).toBeVisible();

  // El plan cuesta 120 y la validez guardada es la renovada.
  const after = await storedPlan(request, admin, plan.id);
  expect(after.items[0].price).toBe(120);
  expect(after.quoteExpired).toBe(false);
  expect(after.quoteValidUntil).not.toBeNull();
  const until = fmt.civilDate(after.quoteValidUntil!);
  await expect(panel.locator('#tp-detail-heading + p').getByTestId('quote-valid-until')).toHaveText(
    `Válido hasta el ${until}`,
    { timeout: 15_000 },
  );
  await expect
    .poll(async () => norm((await panel.textContent()) ?? ''), { timeout: 15_000 })
    .toContain(norm(usd(120)));

  // --- 1440 y 390 px: la ficha y el asistente (ya sin nada que cambiar).
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
    await panel.getByRole('button', { name: 'Actualizar precios' }).click({ timeout: 15_000 });
    await expect(dialog.getByText(/Resina/).first()).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
    await shot(page, 'dx379b-after', viewport.width);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  }
});
