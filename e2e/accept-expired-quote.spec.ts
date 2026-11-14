import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { E2E_DATABASE_URL, expirePlanQuote } from './support/db';
import { E2E_REGION } from './support/regional';
import { axeInBothThemes } from './support/axe';
import {
  expectDialogInsideViewport,
  expectNoHorizontalOverflowInDialog,
  expectNoHorizontalScroll,
} from './support/layout';
import { shot } from './support/qa-shot';
import { regionalFormat } from '../src/lib/format/regional-format';

/**
 * e2e (DX-379, porción C): aceptar con firma un presupuesto VENCIDO.
 *
 * En una clínica nueva (el ajuste es de la clínica): validez de 1 día, un
 * plan presentado con un ítem; la BD lo vence (la API fecha la emisión con el
 * día de la sede). En la ficha, «Aceptar con firma» empieza en «El presupuesto
 * venció el …» con las dos opciones: a 390 y 1440 px, axe limpio, el diálogo
 * dentro de la pantalla y sin desbordar, en la elección y en el motivo. A
 * 1440 px se acepta con los precios originales («Paciente habitual»): el plan
 * queda aceptado y el presupuesto impreso dice «Aceptado con los precios del
 * presupuesto vencido el … Motivo: Paciente habitual».
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
const clinic = {
  subdomain: `test-clinic-vencido-${suffix}`,
  clinicName: `Clínica Vencido ${suffix}`,
  fullName: 'Dra. Vencido',
  email: `vencido.${suffix}@example.com`,
  password: 'Password123!',
};
const fmt = regionalFormat(E2E_REGION);
const DB_SKIP = 'E2E_DATABASE_URL no definido: no se puede vencer el presupuesto';

// El teléfono primero (se cancela), el escritorio después (se firma).
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function apiPut(request: APIRequestContext, s: ApiSession, path: string, body: object): Promise<void> {
  const res = await request.put(`${API_URL}${path}`, { headers: s.headers, data: body });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

interface StoredPlan {
  status: string;
  quoteValidUntil: string | null;
  quoteExpired: boolean;
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

test('un presupuesto vencido se acepta con firma y los precios originales: motivo en el modal y en el documento', async ({
  page,
  context,
  request,
}) => {
  test.skip(!E2E_DATABASE_URL, DB_SKIP);
  const admin = await registerClinicViaApi(request, clinic);
  await apiPut(request, admin, '/treatment-plan-settings', { validityDays: 1 });

  const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
    code: `ven-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Resina ${suffix}`,
    color: '#3366CC',
    defaultPrice: 100,
  });
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Verónica',
    lastName: `Vencido${suffix}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX379C${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, { toothNumber: '16', catalogItemId: catalog.id });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/present`, {});

  expirePlanQuote(plan.id);
  const expired = await storedPlan(request, admin, plan.id);
  expect(expired.quoteExpired).toBe(true);
  const lastValidDay = fmt.civilDate(expired.quoteValidUntil!);

  // La vista imprimible abre el diálogo de impresión: se neutraliza.
  await context.addInitScript(() => {
    window.print = () => undefined;
  });
  await loginAs(page, admin.origin, clinic.email, clinic.password);
  const panel = page.locator('#tabpanel-treatment-plans');
  const dialog = page.getByRole('dialog', { name: 'Aceptar presupuesto con firma' });

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
    // El selector de estado no ofrece «Aceptado»: se acepta con firma.
    await expect(panel.getByText('Vencido: acéptalo con firma para elegir cómo.')).toBeVisible({ timeout: 15_000 });
    await panel.getByRole('button', { name: 'Aceptar con firma' }).click();

    // --- 1. La elección.
    await expect(dialog.getByText(`El presupuesto venció el ${lastValidDay}`)).toBeVisible({ timeout: 15_000 });
    const modes = dialog.getByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await expect(modes.getByRole('radio', { name: /Actualizar los precios y aceptar/ })).toBeChecked();
    await expectDialogClean(viewport.width, 'la elección');
    await shot(page, 'dx379c-choose', viewport.width);

    // --- 2. Precios originales: motivo y nota.
    await modes.getByText('Aceptar con los precios originales').click();
    await dialog.getByLabel('Motivo').selectOption('LOYALTY');
    await expect(dialog.getByLabel('Nota (opcional)')).toBeVisible();
    await expectDialogClean(viewport.width, 'el motivo');
    await shot(page, 'dx379c-reason', viewport.width);

    if (viewport.width < 640) {
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();
      continue;
    }

    // --- 3. La firma (1440 px).
    await dialog.getByRole('button', { name: 'Continuar' }).click();
    await expect(dialog.getByTestId('accept-original-reason')).toHaveText(
      'Se acepta con los precios del presupuesto vencido. Motivo: Paciente habitual.',
    );
    await expectDialogClean(viewport.width, 'la firma');
    await shot(page, 'dx379c-sign', viewport.width);
    const submit = dialog.getByRole('button', { name: 'Aceptar y firmar' });
    await expect(submit).toBeDisabled();
    await signOn(page, dialog.getByRole('img', { name: 'Firma del paciente' }));
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(panel.getByText(/^Aceptado y firmado por /)).toBeVisible({ timeout: 15_000 });
  }

  expect((await storedPlan(request, admin, plan.id)).status).toBe('ACCEPTED');

  // --- 4. El presupuesto impreso dice cómo se aceptó.
  const line = `Aceptado con los precios del presupuesto vencido el ${lastValidDay}. Motivo: Paciente habitual`;
  const [printPage] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('link', { name: /Imprimir presupuesto/ }).click(),
  ]);
  await expect(printPage.getByTestId('quote-expired-acceptance')).toHaveText(line, { timeout: 15_000 });
  for (const viewport of VIEWPORTS) {
    await printPage.setViewportSize(viewport);
    await printPage.reload();
    await expect(printPage.getByTestId('quote-expired-acceptance')).toHaveText(line, { timeout: 15_000 });
    await expectNoHorizontalScroll(printPage);
    await shot(printPage, 'dx379c-print', viewport.width);
  }
  await printPage.close();
});
