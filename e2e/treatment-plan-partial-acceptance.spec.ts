import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
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

/**
 * e2e (DX-417): aceptar en parte un presupuesto presentado.
 *
 * En una clínica nueva, un plan presentado con tres procedimientos (USD 300,
 * 150 y 50). A 390 px se abre «Aceptar en parte», se eligen dos, se ven los
 * totales del servidor, se pasa a la firma y se cancela (axe y sin desbordar
 * en los dos pasos). A 1440 px se
 * eligen los mismos dos, se firma: el original queda aceptado con los dos, un
 * presupuesto pendiente presentado con el tercero, enlazados en la ficha
 * («Aceptado parcialmente» ↔ «Pendiente de aceptación parcial»), y los
 * totales cuadran (aceptado + pendiente = total del presupuesto).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
const clinic = {
  subdomain: `test-clinic-parcial-${suffix}`,
  clinicName: `Clínica Parcial ${suffix}`,
  fullName: 'Dra. Parcial',
  email: `parcial.${suffix}@example.com`,
  password: 'Password123!',
};
const fmt = regionalFormat(E2E_REGION);
const usd = (amount: number) => moneyWithCode(amount, 'USD', fmt);

// El teléfono primero (se cancela), el escritorio después (se firma).
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

interface StoredPlan {
  id: string;
  status: string;
  splitFromPlanId: string | null;
  partialPendingPlanId?: string | null;
  items: { id: string; status: string; price: number }[];
}

async function storedPlan(request: APIRequestContext, s: ApiSession, planId: string): Promise<StoredPlan> {
  const res = await request.get(`${API_URL}/treatment-plans/${planId}`, { headers: s.headers });
  expect(res.ok(), `GET del plan falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as StoredPlan;
}

/** Un trazo con el ratón (Pointer Events: mismo camino que el dedo). */
async function signOn(page: Page, canvas: Locator): Promise<void> {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('lienzo sin caja');
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + 20 + i * 25, box.y + box.height / 2 + (i % 2 ? -18 : 18));
  }
  await page.mouse.up();
}

test('aceptar en parte: dos de tres procedimientos, el resto en un presupuesto pendiente enlazado', async ({
  page,
  request,
}) => {
  const admin = await registerClinicViaApi(request, clinic);
  const procedures = [
    { name: `Corona ${suffix}`, price: 300, tooth: '16' },
    { name: `Resina ${suffix}`, price: 150, tooth: '26' },
    { name: `Limpieza ${suffix}`, price: 50, tooth: '36' },
  ];
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Paula',
    lastName: `Parcial${suffix}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX417${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  for (const [i, p] of procedures.entries()) {
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `par${i}-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: p.name,
      color: '#3366CC',
      defaultPrice: p.price,
    });
    await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, { toothNumber: p.tooth, catalogItemId: catalog.id });
  }
  await apiPost(request, admin, `/treatment-plans/${plan.id}/present`, {});

  await loginAs(page, admin.origin, clinic.email, clinic.password);
  const panel = page.locator('#tabpanel-treatment-plans');
  const dialog = page.getByRole('dialog', { name: 'Aceptar en parte' });
  const totals = dialog.getByRole('region', { name: 'Totales de la aceptación parcial' });

  async function expectDialogClean(width: number, what: string): Promise<void> {
    const found = await axeInBothThemes(page, dialog);
    expect(found.light, `axe de ${what} a ${width} px (claro)`).toEqual([]);
    expect(found.dark, `axe de ${what} a ${width} px (oscuro)`).toEqual([]);
    await expectNoHorizontalOverflowInDialog(dialog);
    await expectDialogInsideViewport(page, dialog);
    await expectNoHorizontalScroll(page);
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
    await panel.getByRole('button', { name: 'Aceptar en parte' }).click();

    // --- 1. Procedimientos: dos de tres, con los totales del servidor.
    await dialog.getByLabel(`Aceptar ${procedures[0].name}`).check();
    await dialog.getByLabel(`Aceptar ${procedures[1].name}`).check();
    // M-9: cada importe con su etiqueta (450 + 50 = 500).
    const cell = (id: string) => totals.getByTestId(id);
    await expect(cell('partial-total-accepted').locator('dd')).toHaveText(usd(450), { timeout: 15_000 });
    await expect(cell('partial-total-accepted').locator('dt')).toHaveText('Aceptado');
    await expect(cell('partial-total-pending').locator('dd')).toHaveText(usd(50));
    await expect(cell('partial-total-pending').locator('dt')).toHaveText('Pendiente');
    await expect(cell('partial-total-original').locator('dd')).toHaveText(usd(500));
    await expect(cell('partial-total-original').locator('dt')).toHaveText('Total del presupuesto');
    await expectDialogClean(viewport.width, 'los procedimientos');
    await shot(page, 'dx417-items', viewport.width);

    // --- 2. La firma de lo aceptado (M-10: también a 390 px, dentro de la pantalla y sin desbordar).
    await dialog.getByRole('button', { name: 'Continuar' }).click();
    const summary = dialog.getByRole('region', { name: 'Lo que se acepta y se firma' });
    await expect(summary).toContainText(procedures[0].name, { timeout: 15_000 });
    await expect(summary).not.toContainText(procedures[2].name);
    await expect(dialog.getByRole('img', { name: 'Firma del paciente' })).toBeVisible();
    await expectDialogClean(viewport.width, 'la firma');
    await shot(page, 'dx417-sign', viewport.width);

    if (viewport.width < 640) {
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();
      continue;
    }

    const submit = dialog.getByRole('button', { name: 'Aceptar en parte y firmar' });
    await expect(submit).toBeDisabled();
    await signOn(page, dialog.getByRole('img', { name: 'Firma del paciente' }));
    await submit.click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  }

  // --- 3. La API: el original aceptado con dos, el pendiente presentado con uno, enlazados.
  const original = await storedPlan(request, admin, plan.id);
  expect(original.status).toBe('ACCEPTED');
  expect(original.items).toHaveLength(2);
  expect(original.items.every((i) => i.status === 'ACCEPTED')).toBe(true);
  const pendingId = original.partialPendingPlanId!;
  expect(pendingId).toBeTruthy();
  const pending = await storedPlan(request, admin, pendingId);
  expect(pending.status).toBe('PRESENTED');
  expect(pending.splitFromPlanId).toBe(plan.id);
  expect(pending.items.map((i) => i.price)).toEqual([50]);

  // --- 4. La ficha: chip y enlace en los dos sentidos, a 390 y 1440.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
    const select = panel.getByLabel('Plan', { exact: true });
    await select.selectOption(plan.id);
    const status = panel.getByTestId('tp-plan-status-line');
    await expect(status).toContainText('Aceptado parcialmente', { timeout: 15_000 });
    await expect(panel.getByText(/^Aceptado y firmado por /)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, 'dx417-original', viewport.width);

    await panel.getByRole('button', { name: /Lo no aceptado está en el presupuesto pendiente del/ }).click();
    await expect(select).toHaveValue(pendingId);
    await expect(status).toContainText('Pendiente de aceptación parcial', { timeout: 15_000 });
    await expect(select.locator('option:checked')).toHaveText(/· pendiente$/);
    await expect(panel.getByRole('button', { name: 'Aceptar con firma' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, 'dx417-pending', viewport.width);

    await panel.getByRole('button', { name: /Resto del plan aceptado el/ }).click();
    await expect(select).toHaveValue(plan.id);
  }
});
