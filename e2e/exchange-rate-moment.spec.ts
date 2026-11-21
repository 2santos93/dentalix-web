import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { sedeDayFromToday, sedeTime } from './support/clock';
import { axeInBothThemes } from './support/axe';
import { fillTime } from './support/dates';
import { expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR } from './support/mail';
import { shot } from './support/qa-shot';
import { API_URL } from './support/urls';

/**
 * e2e DX-586: la tasa del momento.
 *
 * Clínica BCV (Venezuela: sede en VES, acepta USD y VES, «Bs.»), con la tasa
 * del BCV falso (scripts/bcv-stub.mjs, nunca el real: 919,82 Bs. por USD con
 * fecha valor de hoy en Caracas) y un plan en USD:
 *
 *  1. «Actualizar tasa» en el popover del menú (1440): consulta, «Tasa
 *     actualizada.» y queda deshabilitado con el tiempo que falta; tras
 *     recargar, la API lo frena (429, 1 cada 5 min por clínica) y lo dice (390).
 *  2. Cobro en VES de un plan en USD (1440 y 390): antes de confirmar, «Se
 *     cobrará con 1 USD = … 919,82 (BCV, fecha valor …)»; en el recibo y en la
 *     caja, «Tasa usada: … (BCV, fecha valor …)».
 *
 * Clínica manual: dos tasas el mismo día (la primera por la API, desde el
 * inicio del día; la segunda en Ajustes «desde» la hora de ahora). La lista
 * va por día con su hora, el popover del menú ofrece «Registrar tasa» (no hay
 * nada que consultar) y un cobro de ahora usa la segunda.
 *
 * axe en claro y oscuro en cada pantalla; capturas con E2E_QA_DIR.
 */
const BCV_STUB_URL = process.env.E2E_BCV_STUB_URL;
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 12);
const PASSWORD = 'Password123!';
const TODAY = sedeDayFromToday(0);
/** dd/mm/aaaa (es-VE). */
const ddmmyyyy = (day: string) => day.split('-').reverse().join('/');
const TODAY_LABEL = ddmmyyyy(TODAY);
const norm = (text: string | null) => (text ?? '').replace(/\s+/g, ' ');

interface Clinic {
  session: ApiSession;
  email: string;
  patientId: string;
}

let bcv: Clinic | null = null;
let manual: Clinic | null = null;

async function apiPut(request: APIRequestContext, session: ApiSession, path: string, data: object) {
  const res = await request.put(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

/** Clínica de Venezuela (VES), que acepta USD y VES con «Bs.», con un paciente y un plan en USD aceptado. */
async function venezuelanClinic(
  request: APIRequestContext,
  tag: string,
  /** Deja la tasa de hoy antes del plan: el precio de catálogo (VES) se compara con el plan en USD. */
  withRate: (session: ApiSession) => Promise<void>,
): Promise<Clinic> {
  const email = `tasa.${tag}.${suffix}@example.com`;
  const session = await registerClinicViaApi(request, {
    subdomain: `tasa-${tag}-${suffix}`.slice(0, 40),
    clinicName: `Clínica Caroní ${tag} ${suffix}`.slice(0, 60),
    fullName: 'Dra. Caroní',
    email,
    password: PASSWORD,
    location: { currency: 'VES' },
  });
  await apiPut(request, session, '/exchange/settings', { acceptedCurrencies: ['USD', 'VES'] });
  await apiPut(request, session, '/exchange/currency-texts', { entries: [{ currency: 'VES', text: 'Bs.' }] });
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Rosa',
    lastName: `Mérida${suffix.slice(0, 6)}`,
    docType: 'NATIONAL_ID',
    docNumber: `V${tag}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  await withRate(session);
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `tm-${tag}-${suffix}`.slice(0, 40),
    kind: 'PROCEDURE',
    labelEs: `Corona ${tag}`,
    color: '#3366CC',
    // En VES (la moneda de la sede): en el plan en USD queda por encima de lo que se cobra.
    defaultPrice: 1_000_000,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const res = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(res.ok(), `PATCH del ítem falló: ${await res.text()}`).toBeTruthy();
  return { session, email, patientId: patient.id };
}

/** El indicador de la tasa: en el sidebar (escritorio) o en la barra superior (teléfono). */
function indicator(page: Page, phone: boolean): Locator {
  return (phone ? page.locator('header').first() : page.locator('aside')).getByTestId('rate-indicator');
}

/** Abre «Registrar abono» desde el estado de cuenta, en VES, con el importe. */
async function openPaymentInVes(page: Page, clinic: Clinic, amount: string): Promise<Locator> {
  await page.goto(`${clinic.session.origin}/patients/${clinic.patientId}?tab=account-statement`);
  const statement = page.locator('#tabpanel-account-statement');
  await statement.getByRole('button', { name: 'Registrar abono' }).first().click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(dialog.getByLabel('Plan')).toBeVisible({ timeout: 15_000 });
  const currency = dialog.getByLabel('Moneda');
  await expect(currency.locator('option[value="VES"]')).toHaveCount(1, { timeout: 15_000 });
  await currency.selectOption('VES');
  await dialog.getByLabel('Importe').fill(amount);
  return dialog;
}

/** El recibo del abono más reciente del plan (pestaña de planes, «⋯» › «Recibo»). */
async function openLatestReceipt(page: Page, clinic: Clinic): Promise<Locator> {
  await page.goto(`${clinic.session.origin}/patients/${clinic.patientId}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  const fold = panel.getByRole('button', { name: /^Abonos registrados/ });
  await expect(fold).toBeVisible({ timeout: 15_000 });
  if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
  await panel
    .getByRole('button', { name: /^Acciones de abono/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Recibo' }).click();
  const doc = page.getByTestId('receipt-document');
  await expect(doc).toBeVisible({ timeout: 15_000 });
  return doc;
}

test.describe('Tasa del momento (DX-586)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede registrar la clínica (usa scripts/e2e-ci.sh)');
  test.skip(
    !BCV_STUB_URL,
    'E2E_BCV_STUB_URL no definido: la API no apunta al BCV falso (usa scripts/e2e-ci.sh o scripts/bcv-stub.mjs)',
  );
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    bcv = await venezuelanClinic(request, 'bcv', async (session) => {
      await apiPut(request, session, '/exchange/settings', { source: 'BCV' });
      // La tasa del BCV falso la guarda el worker de la API al arrancar.
      await expect
        .poll(
          async () => {
            const res = await request.get(`${API_URL}/exchange/rates?date=${TODAY}&currencies=VES`, {
              headers: session.headers,
            });
            return res.ok() ? ((await res.json()) as { bcv?: { valueDate: string } | null }).bcv?.valueDate : null;
          },
          { message: 'la API no tiene la tasa del BCV falso de hoy', timeout: 60_000 },
        )
        .toBe(TODAY);
    });
    manual = await venezuelanClinic(request, 'man', async (session) => {
      await apiPut(request, session, '/exchange/settings', { source: 'MANUAL' });
      // La primera del día: rige desde el inicio del día.
      await apiPost(request, session, '/exchange/manual-rates', { date: TODAY, currency: 'VES', rate: 36.5 });
    });
  });

  test('1440: «Actualizar tasa» consulta, lo dice y queda deshabilitado con el tiempo que falta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, bcv!.session.origin, bcv!.email, PASSWORD);
    const trigger = indicator(page, false);
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.click();
    const popover = page.getByTestId('rate-indicator-popover');
    const refresh = popover.getByRole('button', { name: 'Actualizar tasa' });
    await expect(refresh).toBeEnabled();
    const popoverAxe = await axeInBothThemes(page, popover);
    expect(popoverAxe.light, 'axe del popover (claro)').toEqual([]);
    expect(popoverAxe.dark, 'axe del popover (oscuro)').toEqual([]);
    await shot(page, 'refresh-popover', 1440);

    const answered = page.waitForResponse(
      (r) => r.url().endsWith('/exchange/refresh') && r.request().method() === 'POST',
    );
    await refresh.click();
    const res = await answered;
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { refresh: { ok: boolean } }).refresh.ok).toBe(true);
    await expect(popover.getByRole('status')).toHaveText('Tasa actualizada.');
    await expect(refresh).toBeDisabled();
    await expect(popover).toContainText('Puedes volver a actualizarla en 5 min.');
    const doneAxe = await axeInBothThemes(page, popover);
    expect(doneAxe.light, 'axe tras actualizar (claro)').toEqual([]);
    expect(doneAxe.dark, 'axe tras actualizar (oscuro)').toEqual([]);
    await shot(page, 'refresh-done', 1440);
  });

  test('390: tras recargar, la API frena la segunda consulta antes de 5 min y el popover lo dice', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, bcv!.session.origin, bcv!.email, PASSWORD);
    const trigger = indicator(page, true);
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page);
    await trigger.click();
    const popover = page.getByTestId('rate-indicator-popover');
    const refresh = popover.getByRole('button', { name: 'Actualizar tasa' });
    // Recién cargada, la pestaña no sabe del turno gastado: lo dice la API.
    await expect(refresh).toBeEnabled();
    const answered = page.waitForResponse(
      (r) => r.url().endsWith('/exchange/refresh') && r.request().method() === 'POST',
    );
    await refresh.click();
    expect((await answered).status()).toBe(429);
    await expect(popover.getByRole('status')).toHaveText(/^Vuelve a intentarlo en \d+ min\.$/);
    await expect(refresh).toBeDisabled();
    await expect(popover).toContainText(/Puedes volver a actualizarla en \d+ min\./);
    const box = (await popover.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const popoverAxe = await axeInBothThemes(page, popover);
    expect(popoverAxe.light, 'axe del popover (claro)').toEqual([]);
    expect(popoverAxe.dark, 'axe del popover (oscuro)').toEqual([]);
    await shot(page, 'refresh-too-soon', 390);
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}: cobro en VES de un plan en USD: la tasa antes de confirmar y en el recibo`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, bcv!.session.origin, bcv!.email, PASSWORD);
      const dialog = await openPaymentInVes(page, bcv!, '91982,27');
      const preview = dialog.getByTestId('rp-rate-preview');
      await expect(preview).toContainText('Equivalente en USD', { timeout: 15_000 });
      await expect
        .poll(async () => norm(await preview.textContent()))
        .toMatch(
          new RegExp(`Se cobrará con 1 USD = .*919,82.* \\(BCV, fecha valor ${TODAY_LABEL} · ${TODAY_LABEL}\\)`),
        );
      await expectNoHorizontalScroll(page);
      const dialogAxe = await axeInBothThemes(page, dialog);
      expect(dialogAxe.light, 'axe del cobro (claro)').toEqual([]);
      expect(dialogAxe.dark, 'axe del cobro (oscuro)').toEqual([]);
      await shot(page, 'payment-preview', viewport.width);
      await dialog.getByRole('button', { name: 'Registrar abono' }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      // Misma tasa que la que se veía: el aviso no habla de un cambio de tasa.
      await expect(page.getByText(/^Abono registrado:/).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/La tasa cambió mientras cobrabas/)).toHaveCount(0);

      const doc = await openLatestReceipt(page, bcv!);
      const rate = doc.getByTestId('receipt-rate');
      await expect(rate).toContainText('Tasa usada: 1 USD = ');
      expect(norm(await rate.textContent())).toMatch(
        new RegExp(`Tasa usada: 1 USD = .*919,82.* \\(BCV, fecha valor ${TODAY_LABEL}\\)$`),
      );
      await shot(page, 'receipt', viewport.width);
      await page.keyboard.press('Escape');

      if (viewport.width === 1440) {
        await page.goto(`${bcv!.session.origin}/caja`);
        const used = page.getByTestId('cash-rate-used').first();
        await expect(used).toBeVisible({ timeout: 30_000 });
        expect(norm(await used.textContent())).toMatch(
          new RegExp(`^Tasa usada: 1 USD = .*919,82.* \\(BCV, fecha valor ${TODAY_LABEL}\\)$`),
        );
        await expectNoHorizontalScroll(page);
        await shot(page, 'cash', 1440);
      }
    });
  }

  test('1440: dos tasas manuales el mismo día: la lista por día con su hora y el cobro de ahora usa la segunda', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, manual!.session.origin, manual!.email, PASSWORD);

    // Con tasa manual no hay nada que consultar: el popover lleva a registrar la nueva.
    const trigger = indicator(page, false);
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.click();
    const popover = page.getByTestId('rate-indicator-popover');
    await expect(popover.getByRole('button', { name: 'Actualizar tasa' })).toHaveCount(0);
    const register = popover.getByRole('link', { name: 'Registrar tasa' });
    await register.click();

    // Llega a Ajustes con el formulario abierto.
    const form = page.getByRole('dialog', { name: 'Registrar tasa' });
    await expect(form).toBeVisible({ timeout: 30_000 });
    const now = sedeTime(new Date());
    await fillTime(form, 'Desde (hora)', now);
    await form.getByLabel('Moneda').selectOption('VES');
    await form.getByLabel('Tasa por 1 USD').fill('40');
    const formAxe = await axeInBothThemes(page, form);
    expect(formAxe.light, 'axe del formulario (claro)').toEqual([]);
    expect(formAxe.dark, 'axe del formulario (oscuro)').toEqual([]);
    await shot(page, 'manual-form', 1440);
    await form.getByRole('button', { name: 'Registrar tasa' }).click();
    await expect(form).toBeHidden({ timeout: 15_000 });

    const day = page.getByTestId('manual-rates-day').first();
    await expect(day.getByRole('heading', { level: 3 })).toHaveText(TODAY_LABEL);
    const rows = day.getByRole('table', { name: `Tasas manuales del ${TODAY_LABEL}` }).getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('Desde las');
    await expect(rows.nth(1)).toContainText('40');
    await expect(rows.nth(2)).toContainText('Inicio del día');
    await expect(rows.nth(2)).toContainText('36,5');
    await expectNoHorizontalScroll(page);
    const settingsAxe = await axeInBothThemes(page, page.locator('main'));
    expect(settingsAxe.light, 'axe de Ajustes (claro)').toEqual([]);
    expect(settingsAxe.dark, 'axe de Ajustes (oscuro)').toEqual([]);
    await day.scrollIntoViewIfNeeded();
    await shot(page, 'manual-list', 1440);

    // Un cobro de ahora usa la de las HH:MM (40), no la de la mañana (36,5).
    const dialog = await openPaymentInVes(page, manual!, '4000');
    const preview = dialog.getByTestId('rp-rate-preview');
    await expect
      .poll(async () => norm(await preview.textContent()), { timeout: 15_000 })
      .toMatch(new RegExp(`Se cobrará con 1 USD = .*40,00.* \\(manual · ${TODAY_LABEL}\\)`));
    await dialog.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const doc = await openLatestReceipt(page, manual!);
    expect(norm(await doc.getByTestId('receipt-rate').textContent())).toMatch(
      new RegExp(`Tasa usada: 1 USD = .*40,00.* \\(manual, ${TODAY_LABEL}`),
    );
  });

  test('390: la lista de tasas manuales por día cabe en el teléfono', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, manual!.session.origin, manual!.email, PASSWORD);
    await page.goto(`${manual!.session.origin}/settings/tasa-de-cambio`);
    const day = page.getByTestId('manual-rates-day').first();
    await expect(day).toContainText('Desde las', { timeout: 30_000 });
    await expect(day).toContainText('Inicio del día');
    await expectNoHorizontalScroll(page);
    const axe = await axeInBothThemes(page, page.locator('main'));
    expect(axe.light, 'axe de Ajustes (claro)').toEqual([]);
    expect(axe.dark, 'axe de Ajustes (oscuro)').toEqual([]);
    await day.scrollIntoViewIfNeeded();
    await shot(page, 'manual-list', 390);
  });
});
