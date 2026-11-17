import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { E2E_REGION } from './support/regional';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalOverflowInDialog, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e (DX-041): «Financiar» del presupuesto.
 *
 * Una clínica nueva con un plan presentado de USD 1.000 (dos procedimientos).
 * A 390 y 1440 px: se simulan tres opciones (axe en claro y oscuro, sin
 * desbordar), la vista A4 las imprime en el bloque «Opciones de pago» (y el
 * PDF de Chromium sale), el enlace de WhatsApp lleva el texto con las
 * opciones; a 1440 px se acepta con la opción 2 y el plan de cuotas guardado
 * tiene exactamente las cuotas que se mostraron.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
const clinic = {
  subdomain: `test-clinic-cuotas-${suffix}`,
  clinicName: `Clínica Cuotas ${suffix}`,
  fullName: 'Dra. Cuotas',
  email: `cuotas.${suffix}@example.com`,
  password: 'Password123!',
};
const fmt = regionalFormat(E2E_REGION);
const usd = (amount: number) => moneyWithCode(amount, 'USD', fmt);

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

interface StoredPaymentPlan {
  totalToFinance: number;
  downPayment: number;
  installments: { sequence: number; dueDate: string; amount: number }[];
}

async function storedPaymentPlan(request: APIRequestContext, s: ApiSession, planId: string): Promise<StoredPaymentPlan> {
  const res = await request.get(`${API_URL}/treatment-plans/${planId}/payment-plan`, { headers: s.headers });
  expect(res.ok(), `GET del plan de cuotas falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as StoredPaymentPlan;
}

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

test('Financiar: tres opciones en pantalla, en el PDF y por WhatsApp; aceptar con una crea el plan de cuotas', async ({
  page,
  context,
  request,
}) => {
  const admin = await registerClinicViaApi(request, clinic);
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Valeria',
    lastName: `Cuotas${suffix}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX041${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  for (const [i, price] of [600, 400].entries()) {
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `cuo${i}-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: `Implante ${i + 1} ${suffix}`,
      color: '#3366CC',
      defaultPrice: price,
    });
    await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, {
      toothNumber: i === 0 ? '36' : '46',
      catalogItemId: catalog.id,
    });
  }
  await apiPost(request, admin, `/treatment-plans/${plan.id}/present`, {});

  await loginAs(page, admin.origin, clinic.email, clinic.password);
  const panel = page.locator('#tabpanel-treatment-plans');
  const block = panel.getByRole('region', { name: 'Financiar' });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
    await block.getByRole('button', { name: 'Simular cuotas' }).click();
    await block.getByRole('button', { name: 'Agregar opción' }).click();
    await block.getByRole('button', { name: 'Agregar opción' }).click();
    // Opción 1: inicial de 100 y 3 mensuales; opción 2: 6 quincenales; opción 3: 12 mensuales.
    await block.getByLabel('Cuota inicial').first().fill('100');
    await block.getByLabel('Periodicidad').nth(1).selectOption('BIWEEKLY');
    await block.getByRole('button', { name: 'Calcular cuotas' }).click();

    const option1 = block.getByTestId('financing-option-1');
    await expect(option1).toContainText(`3 × ${usd(300)}`, { timeout: 15_000 });
    await expect(block.getByTestId('financing-option-2')).toContainText(`6 × ${usd(166.66)}`);
    await expect(block.getByTestId('financing-option-2')).toContainText(`la última de ${usd(166.7)}`);
    await expect(block.getByTestId('financing-option-3')).toContainText(`12 × ${usd(83.33)}`);
    await expect(block.getByText(/Saldo que se financia/)).toContainText(usd(1000));

    const found = await axeInBothThemes(page, block);
    expect(found.light, `axe de «Financiar» a ${viewport.width} px (claro)`).toEqual([]);
    expect(found.dark, `axe de «Financiar» a ${viewport.width} px (oscuro)`).toEqual([]);
    await expectNoHorizontalScroll(page);
    await block.scrollIntoViewIfNeeded();
    await shot(page, 'dx041-financing', viewport.width);

    // WhatsApp: wa.me con el texto de las tres opciones (sin proveedor, DX-126).
    const whatsapp = block.getByRole('link', { name: /Enviar por WhatsApp/ });
    const href = (await whatsapp.getAttribute('href')) ?? '';
    expect(href).toMatch(/^https:\/\/wa\.me\//);
    const message = decodeURIComponent(href.split('?text=')[1] ?? '');
    expect(message).toContain('Opción 1: Inicial de');
    expect(message).toContain('Opción 3:');
    expect(message).not.toContain('—');

    // La vista A4 con las opciones (y su PDF).
    const printLink = block.getByRole('link', { name: /Imprimir con estas opciones/ });
    const printHref = (await printLink.getAttribute('href')) ?? '';
    const printPage = await context.newPage();
    await printPage.addInitScript(() => {
      window.print = () => undefined;
    });
    await printPage.setViewportSize(viewport);
    await printPage.goto(`${admin.origin}${printHref}`);
    const options = printPage.getByTestId('quote-payment-options');
    await expect(options).toBeVisible({ timeout: 15_000 });
    await expect(options.getByRole('heading', { name: 'Opciones de pago' })).toBeVisible();
    // En pantalla estrecha, fichas; desde 640 px y en papel, la tabla.
    const row = (n: number) =>
      printPage.getByTestId(viewport.width < 640 ? `quote-payment-card-${n}` : `quote-payment-option-${n}`);
    await expect(row(1)).toContainText(usd(100));
    await expect(row(2)).toContainText(`6 quincenales de ${usd(166.66)}`);
    await expect(row(3)).toContainText(`12 mensuales de ${usd(83.33)}`);
    await expectNoHorizontalScroll(printPage);
    await shot(printPage, 'dx041-print', viewport.width);
    await printPage.emulateMedia({ media: 'print' });
    await expect(options).toBeVisible();
    await expect(printPage.getByTestId('quote-payment-option-2')).toBeVisible();
    const pdf = await printPage.pdf({ format: 'A4', preferCSSPageSize: true });
    expect(pdf.byteLength).toBeGreaterThan(1000);
    const qaDir = process.env.E2E_QA_DIR;
    if (qaDir) {
      mkdirSync(qaDir, { recursive: true });
      writeFileSync(`${qaDir}/dx041-presupuesto-${viewport.width}.pdf`, pdf);
    }
    await printPage.close();
  }

  // A 1440 px: aceptar con la opción 2 (quincenal).
  const option2 = block.getByTestId('financing-option-2');
  await option2.getByRole('button', { name: 'Aceptar con esta opción' }).click();
  const dialog = page.getByRole('dialog', { name: 'Aceptar presupuesto con firma' });
  await expect(dialog.getByTestId('accept-installments')).toContainText('6 cuotas quincenales', { timeout: 15_000 });
  const foundDialog = await axeInBothThemes(page, dialog);
  expect(foundDialog.light).toEqual([]);
  expect(foundDialog.dark).toEqual([]);
  await expectNoHorizontalOverflowInDialog(dialog);
  await expectDialogInsideViewport(page, dialog);
  await shot(page, 'dx041-accept', 1440);
  await signOn(page, dialog.getByRole('img', { name: 'Firma del paciente' }));
  await dialog.getByRole('button', { name: 'Aceptar y firmar' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const stored = await storedPaymentPlan(request, admin, plan.id);
  expect(stored.totalToFinance).toBe(1000);
  expect(stored.downPayment).toBe(0);
  // Las mismas cuotas que se mostraron: 5 de 166,66 y la última de 166,70.
  expect(stored.installments.map((i) => i.amount)).toEqual([166.66, 166.66, 166.66, 166.66, 166.66, 166.7]);
  // La ficha enseña el plan de cuotas recién creado y ya no ofrece «Financiar».
  await expect(block).toBeHidden();
  await expectNoHorizontalScroll(page);
});
