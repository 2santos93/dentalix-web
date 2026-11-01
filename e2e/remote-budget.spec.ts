import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi } from './support/api';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR, linkFromMail, mailMark } from './support/mail';
import { E2E_BROWSER_LOCALE } from './support/regional';

/**
 * e2e DX-415: aceptación del presupuesto a distancia.
 *
 *   1. La administradora de una clínica nueva (sembrada por la API: paciente
 *      con email y un plan COP «Presentado» con un procedimiento) abre la
 *      ficha → «Plan de tratamiento» a 1440 px → «Enviar a aceptar»: el modal
 *      muestra el destinatario enmascarado; al enviar, el estado «Enviado».
 *   2. La paciente abre el enlace del email a 390 px y sin sesión: pide el
 *      código, lo escribe, ve el procedimiento, los totales y las
 *      condiciones, acepta y firma con el dedo; queda la copia imprimible. El
 *      mismo enlace después: «Enlace no válido».
 *   3. La ficha (1440 y 390) dice «Aceptado a distancia por …» con las
 *      evidencias y el plan ya no se puede enviar.
 *
 * Estado: crea su propia clínica (no toca la demo).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinic = {
  subdomain: `test-clinic-presup-${suffix}`.slice(0, 40),
  clinicName: `Clínica Presupuesto ${suffix}`,
  fullName: 'Dra. Presupuesto',
  email: `presupuesto.${suffix}@example.com`,
  password: 'Password123!',
};
const PATIENT_EMAIL = `marta.${suffix}@example.com`.slice(0, 60);
const PROCEDURE = `Corona ${suffix}`.slice(0, 40);

let origin = '';
let patientId = '';
let link = '';

test.describe.configure({ mode: 'serial' });

async function drawSignature(page: Page, canvas: Locator): Promise<void> {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('el lienzo de firma no se ve');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
}

test.describe('Presupuesto a distancia (DX-415)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)');

  test.beforeAll(async ({ request }) => {
    const admin = await registerClinicViaApi(request, clinic);
    origin = admin.origin;
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `cor-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: PROCEDURE,
      color: '#3366CC',
      defaultPrice: 300_000,
    });
    const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
      firstName: 'Marta',
      lastName: `Ríos${suffix}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber: `DX415${suffix}`.slice(0, 20),
      sex: 'F',
      email: PATIENT_EMAIL,
      birthDate: '1988-05-20',
    });
    patientId = patient.id;
    const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
      currency: 'COP',
    });
    await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, {
      toothNumber: '36',
      catalogItemId: catalog.id,
    });
    await apiPost(request, admin, `/treatment-plans/${plan.id}/present`, {});
  });

  test('la clínica envía a aceptar el presupuesto presentado (1440)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, clinic.email, clinic.password);
    await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
    await page.getByRole('button', { name: 'Enviar a aceptar' }).click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Enviar a aceptar' });
    await expect(dialog.getByRole('region', { name: 'Destinatario' })).toContainText(/ma\*\*\*@example\.com · acepta/);
    await expectDialogInsideViewport(page, dialog);
    const sentSince = mailMark();
    await dialog.getByRole('button', { name: 'Enviar a aceptar' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Enviado a aceptar a ma\*\*\*@example\.com .* · Enviado/)).toBeVisible();

    link = await linkFromMail(PATIENT_EMAIL, /(https?:\/\/\S+\/firmar\/[A-Za-z0-9_-]{43})/, { since: sentSince });
  });

  test('la paciente ve el presupuesto y lo acepta desde el móvil (390 px, sin sesión)', async ({ browser }) => {
    expect(link, 'el test anterior no dejó el enlace').not.toBe('');
    const context = await browser.newContext({
      locale: E2E_BROWSER_LOCALE,
      timezoneId: 'America/Bogota',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto(link);
      await expect(page.getByText(/Para ver el presupuesto, te enviaremos un código/)).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(PROCEDURE)).toHaveCount(0);
      await expectNoHorizontalScroll(page);

      const codeSince = mailMark();
      await page.getByRole('button', { name: 'Enviarme el código' }).click();
      const code = await linkFromMail(PATIENT_EMAIL, /Tu código de verificación es: (\d{6})/, { since: codeSince });
      await page.getByLabel('Código de 6 dígitos').fill(code);
      await page.getByRole('button', { name: 'Ver el presupuesto' }).click();

      const budget = page.getByRole('article', { name: 'Presupuesto y condiciones' });
      await expect(budget.getByRole('list', { name: 'Procedimientos del presupuesto' })).toContainText(PROCEDURE);
      await expect(budget).toContainText('Total (COP)');
      await expect(budget).toContainText('Al firmar aceptas este presupuesto');
      await expectNoHorizontalScroll(page);

      await page.getByRole('checkbox', { name: /he revisado el presupuesto/i }).check();
      await drawSignature(page, page.getByRole('img', { name: 'Tu firma' }));
      const acceptedSince = mailMark();
      await page.getByRole('button', { name: 'Aceptar y firmar' }).click();
      await expect(page.getByRole('heading', { name: 'Presupuesto aceptado' })).toBeVisible();
      await expect(page.getByRole('button', { name: /imprimir o guardar en pdf/i })).toBeVisible();
      await expectNoHorizontalScroll(page);

      await linkFromMail(PATIENT_EMAIL, /(registramos tu aceptación)/, { since: acceptedSince });

      await page.goto(link);
      await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('la ficha dice «Aceptado a distancia» con las evidencias (1440 y 390)', async ({ page }) => {
    await loginAs(page, origin, clinic.email, clinic.password);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
      await expect(page.getByText(/Aceptado a distancia por Marta/)).toBeVisible({ timeout: 15_000 });
      const evidence = page.getByLabel('Evidencias de la aceptación a distancia');
      await expect(evidence).toContainText('Código verificado');
      await expect(evidence).toContainText('ma***@example.com');
      await expect(page.getByRole('button', { name: 'Enviar a aceptar' })).toHaveCount(0);
      if (viewport.width === 390) await expectNoHorizontalScroll(page);
    }
  });
});
