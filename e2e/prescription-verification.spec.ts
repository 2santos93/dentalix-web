import { test, expect } from './support/test';
import { apiLogin, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeViolations } from './support/axe';
import { DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';
import type { APIRequestContext } from '@playwright/test';

/**
 * e2e (DX-467): receta verificable.
 *
 *   1. La receta impresa lleva el código de verificación (en grupos de 4) y un
 *      QR a `/receta/<código>` del host de la clínica, y cabe en UNA hoja.
 *   2. La página pública, sin sesión, dice «Receta válida» con la fecha, el
 *      profesional y su registro, la clínica y las iniciales del paciente;
 *      nada de lo prescrito. A 390 y 1440 px sin scroll horizontal y sin
 *      violaciones de axe.
 *   3. Tras anularla, la MISMA URL dice «Receta anulada el DD/MM/AAAA», sin
 *      caché.
 *   4. Un código inexistente: «Receta no encontrada».
 *
 * Usa la clínica DEMO (`npm run seed:demo`) con su dentista, que tiene
 * registro profesional. Crea un paciente y una receta propios.
 */
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const suffix = (process.env.E2E_RUN_SUFFIX ?? `${Date.now()}`).replace(/[^a-z0-9]/gi, '').slice(-8);
const LAST_NAME = `Verificable${suffix}`;
const MEDICATION = 'Clindamicina';
const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/;

const grouped = (code: string) => `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;

async function apiPost<T>(request: APIRequestContext, session: ApiSession, path: string, data: object): Promise<T> {
  const res = await request.post(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

test('receta impresa con código y QR; página pública válida y anulada a 390 y 1440 px', async ({ page, browser }) => {
  const session = await apiLogin(page.request, origin, DENTIST_EMAIL, DEMO_PASSWORD);
  const patient = await apiPost<{ id: string }>(page.request, session, '/patients', {
    firstName: 'Teresa',
    lastName: LAST_NAME,
    docType: 'NATIONAL_ID',
    docNumber: `V${suffix}`,
    sex: 'F',
  });
  const rx = await apiPost<{ id: string; verificationCode: string }>(
    page.request,
    session,
    `/patients/${patient.id}/prescriptions`,
    {
      items: [
        {
          activeIngredient: MEDICATION,
          concentration: '300 mg',
          pharmaceuticalForm: 'Cápsula',
          route: 'Oral',
          dose: '1 cápsula',
          frequency: 'Cada 8 horas',
          durationDays: 7,
          totalQuantity: 21,
          quantityUnit: 'cápsulas',
        },
      ],
    },
  );
  expect(rx.verificationCode).toMatch(CODE_PATTERN);
  const publicUrl = `${origin}/receta/${rx.verificationCode}`;

  // --- 1. La receta impresa: código y QR, en una sola hoja ---
  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  await loginAs(page, origin, DENTIST_EMAIL, DEMO_PASSWORD);
  await page.goto(`${origin}/print/patients/${patient.id}/prescriptions/${rx.id}`);
  const verification = page.getByRole('region', { name: 'Verificación de la receta' });
  await expect(verification).toBeVisible({ timeout: 15_000 });
  await expect(verification).toContainText(grouped(rx.verificationCode));
  await expect(verification).toContainText(publicUrl.replace(/^https?:\/\//, ''));
  const qr = verification.locator('svg');
  await expect(qr).toBeVisible();
  await expect(qr.locator('title')).toHaveText('Código QR para verificar la receta');
  await page.emulateMedia({ media: 'print' });
  await expect(verification).toBeVisible();
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1);
  await page.emulateMedia({ media: 'screen' });

  // --- 2. La página pública, sin sesión: válida ---
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    const visitor = await browser.newContext({ viewport });
    const pharmacy = await visitor.newPage();
    const response = await pharmacy.goto(publicUrl);
    expect(response?.headers()['cache-control']).toBe('no-store');
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    const main = pharmacy.getByRole('main');
    await expect(pharmacy.getByRole('heading', { level: 1, name: 'Receta válida' })).toBeVisible({
      timeout: 15_000,
    });
    const field = (label: string) => main.locator(`dt:text-is("${label}") + dd`);
    await expect(field('Fecha de emisión')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);
    await expect(field('Profesional')).not.toBeEmpty();
    await expect(field('Nº de registro profesional')).not.toHaveText('—');
    await expect(field('Clínica')).not.toBeEmpty();
    await expect(field('Paciente')).toHaveText('T. V.');
    await expect(main).not.toContainText(MEDICATION);
    await expect(main).not.toContainText(LAST_NAME);
    await expect(main).not.toContainText(`V${suffix}`);
    await expectNoHorizontalScroll(pharmacy);
    expect(await axeViolations(pharmacy, main)).toEqual([]);
    await visitor.close();
  }

  // --- 3. Anulada: la misma URL lo dice al momento ---
  await apiPost(page.request, session, `/prescriptions/${rx.id}/void`, { reason: 'Dosis equivocada' });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    const visitor = await browser.newContext({ viewport });
    const pharmacy = await visitor.newPage();
    const response = await pharmacy.goto(publicUrl);
    expect(response?.headers()['cache-control']).toBe('no-store');
    await expect(
      pharmacy.getByRole('heading', { level: 1, name: /^Receta anulada el \d{2}\/\d{2}\/\d{4}$/ }),
    ).toBeVisible({ timeout: 15_000 });
    const main = pharmacy.getByRole('main');
    await expect(main).toContainText('No es válida para dispensar.');
    await expect(main).not.toContainText('Dosis equivocada');
    await expect(main).not.toContainText('Receta válida');
    await expectNoHorizontalScroll(pharmacy);
    expect(await axeViolations(pharmacy, main)).toEqual([]);
    await visitor.close();
  }

  // --- 4. Código inexistente ---
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pharmacy = await visitor.newPage();
  await pharmacy.goto(`${origin}/receta/ZZZZZZZZZZZZ`);
  await expect(pharmacy.getByRole('heading', { level: 1, name: 'Receta no encontrada' })).toBeVisible({
    timeout: 15_000,
  });
  await visitor.close();
});
