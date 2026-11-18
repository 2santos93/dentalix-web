import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { E2E_REGION } from './support/regional';
import { atSede, sedeDayFromToday } from './support/clock';
import { pdfText } from './support/pdf-text';
import { shot } from './support/qa-shot';
import { previousMonthOf } from '../src/lib/commissions/commissions-api';
import type { Locator, Page } from './support/test';

/**
 * e2e (DX-464): pagar la liquidación de honorarios contra la API real.
 *
 * Registra una clínica (su dueña es ADMIN y atiende), siembra por la API dos
 * endodoncias realizadas y cobradas el mes pasado, la regla «35 % de lo
 * cobrado» y la liquidación cerrada; y en /honorarios/:id:
 *   - paga una línea (parcial) y luego la otra (total): el estado pasa de
 *     «Pendiente de pago» a «Pagada parcialmente» y a «Pagada»;
 *   - anula el segundo pago con motivo: vuelve a «Pagada parcialmente»;
 *   - pide la conformidad del primero y el profesional la firma en la página
 *     pública /conformidad/<token>, sin sesión;
 *   - descarga el PDF de la liquidación: lleva las iniciales del paciente y
 *     nunca su nombre.
 * Con `E2E_QA_DIR`, capturas a 1440 y 390 px en claro y oscuro.
 */
const API = API_URL;
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-hpag-${suffix}`.slice(0, 50);
const email = `test.user.hpagos.${suffix}@example.com`;
const password = 'Password123!';
const patientFirst = 'Rosa';
const patientLast = `Pagohon${suffix}`.slice(0, 40);
const INITIALS = 'R. P.';

const TODAY = sedeDayFromToday(0, E2E_REGION.timeZone);
const LAST_MONTH = previousMonthOf(TODAY);
const day = (dd: string) => `${LAST_MONTH.from.slice(0, 8)}${dd}`;

const WIDTHS = [1440, 390] as const;

async function qaShots(page: Page, name: string, prepare: () => Promise<Locator | null>): Promise<void> {
  if (!process.env.E2E_QA_DIR) return;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const target = await prepare();
    if (target) await target.scrollIntoViewIfNeeded();
    await shot(page, name, width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
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

/** Siembra dos procedimientos cobrados el mes pasado, la regla y la liquidación cerrada; devuelve su id. */
async function seed(request: APIRequestContext, origin: string, accessToken: string): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': new URL(origin).host };
  async function call<T>(method: 'post' | 'patch' | 'put' | 'get', path: string, data?: object): Promise<T> {
    const res = await request[method](`${API}${path}`, { headers, ...(data ? { data } : {}) });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await call<{ id: string }>('post', '/patients', {
    firstName: patientFirst,
    lastName: patientLast,
    docType: 'NATIONAL_ID',
    docNumber: `HP${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await call<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, { currency: 'USD' });
  for (const [i, tooth] of (['11', '21'] as const).entries()) {
    const catalog = await call<{ id: string }>('post', '/catalog/items', {
      code: `hp${i}-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: `Endodoncia ${tooth}-${suffix}`.slice(0, 60),
      category: 'Endodoncia',
      color: '#3366CC',
      defaultPrice: 200,
    });
    const item = await call<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
      toothNumber: tooth,
      catalogItemId: catalog.id,
    });
    const itemPath = `/treatment-plans/${plan.id}/items/${item.id}`;
    await call('patch', itemPath, { status: 'ACCEPTED' });
    await call('patch', itemPath, { status: 'DONE' });
    await call('patch', itemPath, { completedAt: atSede(day('10'), '10:00', E2E_REGION.timeZone).toISOString() });
  }
  // Dos abonos de 200: cada uno se imputa a un ítem.
  for (const paidOn of [day('12'), day('13')]) {
    await call('post', `/treatment-plans/${plan.id}/payments`, { amount: 200, currency: 'USD', paidAt: paidOn, method: 'CASH' });
  }
  const rules = await call<{ professionals: { professional: { userId: string } }[] }>('get', '/commissions/rules');
  const userId = rules.professionals[0].professional.userId;
  await call('put', `/commissions/rules/${userId}`, {
    basis: 'COLLECTED',
    releaseMode: 'PER_ITEM',
    percent: 35,
    categories: [],
    active: true,
    deductLabCost: false,
    deductCardFee: false,
  });
  const settlement = await call<{ id: string; lines: unknown[] }>('post', '/commissions/settlements', {
    userId,
    from: LAST_MONTH.from,
    to: LAST_MONTH.to,
  });
  expect(settlement.lines.length).toBeGreaterThanOrEqual(2);
  return settlement.id;
}

test('honorarios: pagar parcial y total, anular, conformidad firmada y PDF con iniciales', async ({ page, context }) => {
  test.setTimeout(240_000);
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Pagos Honorarios ${suffix}`,
    fullName: 'Ana Admin',
    email,
    password,
  });
  const settlementId = await seed(page.request, origin, await accessTokenOf(page));

  await page.goto(`${origin}/honorarios/${settlementId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Liquidación de Ana Admin' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Pendiente de pago').first()).toBeVisible();

  // --- Pago parcial: solo la primera línea ---
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  let dialog = page.getByRole('dialog', { name: 'Registrar pago' });
  const lines = dialog.getByRole('checkbox', { name: /Diente/ });
  await expect(lines).toHaveCount(2);
  await expect(dialog.getByTestId('commission-pay-total')).toContainText('140');
  await qaShots(page, 'pago-dialogo', async () => dialog.getByRole('heading', { name: 'Registrar pago' }));
  await lines.nth(1).uncheck();
  await expect(dialog.getByTestId('commission-pay-total')).toContainText('70');
  await dialog.getByRole('textbox', { name: 'Referencia' }).fill('TRF-0001');
  await dialog.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('Pagada parcialmente').first()).toBeVisible({ timeout: 15_000 });
  const payments = page.getByRole('table', { name: 'Pagos de la liquidación, el más reciente primero' });
  await expect(payments.getByRole('row')).toHaveCount(2);

  // --- Pago total: lo que queda ---
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  dialog = page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(dialog.getByRole('checkbox', { name: /Diente/ })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('Pagada', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeHidden();
  await expect(payments.getByRole('row')).toHaveCount(3);

  // --- Anular el último pago (el más reciente va primero) ---
  await payments.getByRole('button', { name: /^Acciones de/ }).first().click();
  await page.getByRole('menuitem', { name: 'Anular' }).click();
  const voidDialog = page.getByRole('dialog', { name: '¿Anular este pago?' });
  await voidDialog.getByRole('textbox', { name: 'Motivo de la anulación' }).fill('Transferencia devuelta por el banco');
  await voidDialog.getByRole('button', { name: 'Anular pago' }).click();
  await expect(voidDialog).toBeHidden({ timeout: 15_000 });
  await expect(payments).toContainText('Anulado: Transferencia devuelta por el banco', { timeout: 15_000 });
  await expect(page.getByText('Pagada parcialmente').first()).toBeVisible();
  await qaShots(page, 'pago-cabecera', async () => page.getByRole('heading', { level: 1 }));
  await qaShots(page, 'pago-detalle', async () => page.getByRole('heading', { name: 'Pagos', exact: true }));

  // --- Enviar ---
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const send = page.getByRole('dialog', { name: 'Enviar la liquidación' });
  await expect(send.getByRole('link', { name: /Por email/ })).toHaveAttribute('href', new RegExp(`^mailto:${email.replace(/[.+]/g, '\\$&')}\\?subject=`));
  await qaShots(page, 'pago-enviar', async () => send.getByRole('heading', { name: 'Enviar la liquidación' }));
  await send.getByRole('button', { name: 'Cerrar' }).first().click();

  // --- Pedir conformidad del primer pago (fila con TRF-0001) ---
  await payments.getByRole('row').filter({ hasText: 'TRF-0001' }).getByRole('button', { name: /^Acciones de/ }).click();
  await page.getByRole('menuitem', { name: 'Pedir conformidad' }).click();
  const receipt = page.getByRole('dialog', { name: 'Pedir conformidad' });
  await receipt.getByRole('button', { name: 'Crear enlace' }).click();
  const linkInput = receipt.getByRole('textbox', { name: 'Enlace de conformidad' });
  await expect(linkInput).toHaveValue(/\/conformidad\/[A-Za-z0-9_-]+$/, { timeout: 15_000 });
  const url = await linkInput.inputValue();
  await expect(receipt.getByRole('link', { name: /Enviar por WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  await qaShots(page, 'pago-conformidad', async () => linkInput);
  await receipt.getByRole('button', { name: 'Cerrar' }).first().click();

  // --- Página pública, sin sesión ---
  const pub = await context.browser()!.newPage();
  await pub.goto(url);
  await expect(pub.getByRole('heading', { level: 1, name: 'Recibo de pago de honorarios' })).toBeVisible({ timeout: 15_000 });
  const receiptTable = pub.getByRole('table', { name: 'Prestaciones pagadas' });
  await expect(receiptTable).toContainText(INITIALS);
  await expect(receiptTable).not.toContainText(patientLast);
  await expect(pub.getByRole('textbox', { name: 'Tu nombre completo' })).toHaveValue('Ana Admin');
  await qaShots(pub, 'conformidad-pendiente', async () => pub.getByRole('heading', { level: 1 }));
  await signOn(pub, pub.getByRole('img', { name: 'Tu firma' }));
  await pub.getByRole('checkbox', { name: /Recibí conforme el pago/ }).check();
  await pub.getByRole('button', { name: 'Firmar' }).click();
  await expect(pub.getByRole('heading', { name: 'Conformidad firmada' })).toBeVisible({ timeout: 15_000 });
  const signedDownload = pub.waitForEvent('download');
  await pub.getByRole('button', { name: 'Descargar copia firmada' }).click();
  const signedPdf = await readFile((await (await signedDownload).path())!);
  expect(signedPdf.subarray(0, 5).toString()).toBe('%PDF-');
  if (process.env.E2E_QA_DIR) await writeFile(`${process.env.E2E_QA_DIR}/conformidad-firmada.pdf`, signedPdf);
  await qaShots(pub, 'conformidad-firmada', async () => pub.getByRole('heading', { name: 'Conformidad firmada' }));
  await pub.close();

  await page.reload();
  await expect(payments).toContainText('Firmada conforme', { timeout: 15_000 });

  // --- PDF de la liquidación: iniciales, nunca el nombre ---
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  const pdf = await readFile((await (await download).path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  if (process.env.E2E_QA_DIR) await writeFile(`${process.env.E2E_QA_DIR}/liquidacion.pdf`, pdf);
  const text = pdfText(pdf);
  expect(text).toContain(INITIALS);
  expect(text).not.toContain(patientLast);

  // --- La lista enseña el estado ---
  await page.goto(`${origin}/honorarios`);
  await expect(page.getByRole('table', { name: 'Liquidaciones cerradas, la más reciente primero' })).toContainText(
    'Pagada parcialmente',
    { timeout: 15_000 },
  );
});
