import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { apiLogin } from './support/api';
import { loginAs } from './support/auth';
import { DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR, linkFromMail } from './support/mail';
import { E2E_BROWSER_LOCALE } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-243: firma a distancia de un consentimiento, contra la clínica DEMO
 * sembrada (`npm run seed:demo` en la API; la API corre con
 * MAIL_TRANSPORT=file y la suite lee el buzón de E2E_MAIL_DIR, como DX-029).
 *
 *   1. Recepción (1440) abre la ficha de Laura Castro (DEMO-0001) →
 *      «Consentimientos» → «Firma a distancia» → «Enviar a firmar»: elige la
 *      plantilla demo de exodoncia y al Dr. Andrés Gómez; el envío sale
 *      «Enviado» con el email enmascarado.
 *   2. La paciente abre el enlace del email SIN sesión a 390 px (no-store,
 *      no-referrer y noindex en la respuesta; sin scroll horizontal): solo ve
 *      adónde va el código; lo pide, se equivoca una vez («Te quedan 4
 *      intentos»), escribe el bueno, lee el documento, confirma y firma con el
 *      dedo. El mismo enlace después: «Enlace no válido».
 *   3. Recepción ve «Firmado por paciente» con la IP de la firma.
 *   4. El Dr. Andrés Gómez (1440) ve «Falta firma del profesional», firma como
 *      profesional y el consentimiento queda «Completo» (también en la
 *      sección de firma a distancia).
 *
 * Estado compartido (DX-337): deja en la demo una solicitud firmada y un
 * consentimiento completo de Laura Castro (inmutables, como cualquier
 * consentimiento firmado); no crea sedes ni personal.
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const RECEPTION_EMAIL = 'recepcion@demo.dentalix.app';
const DENTIST_EMAIL = 'dentista@demo.dentalix.app';
const DENTIST_NAME = 'Andrés Gómez Pérez';
const PATIENT_EMAIL = 'laura.castro@example.com';
const PATIENT_DOC = 'DEMO-0001';
const TEMPLATE_TITLE = 'Consentimiento informado — Exodoncia';

let patientId = '';
let link = '';

test.describe.configure({ mode: 'serial' });

async function demoPatientId(request: APIRequestContext): Promise<string> {
  const session = await apiLogin(request, origin, RECEPTION_EMAIL, DEMO_PASSWORD);
  const res = await request.get(`${API_URL}/patients?query=${PATIENT_DOC}`, { headers: session.headers });
  expect(res.ok(), `GET /patients falló: ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { items: { id: string; docNumber: string | null }[] };
  const found = body.items.find((p) => p.docNumber === PATIENT_DOC);
  expect(found, `la demo no tiene a ${PATIENT_DOC}`).toBeTruthy();
  return found!.id;
}

/** Un trazo con el ratón (o el dedo) dentro del lienzo de firma. */
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

function signatureRows(page: Page): Locator {
  return page.getByRole('list', { name: 'Consentimientos enviados a firmar' }).locator(':scope > li');
}

test.describe('Firma a distancia de consentimientos (DX-243)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)');

  test.beforeAll(async ({ request }) => {
    patientId = await demoPatientId(request);
  });

  test('recepción envía el consentimiento a firmar desde la ficha', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, RECEPTION_EMAIL, DEMO_PASSWORD);
    await page.goto(`${origin}/patients/${patientId}?tab=consents`);
    const section = page.getByTestId('patient-signature-requests');
    await expect(section.getByRole('heading', { name: 'Firma a distancia' })).toBeVisible({ timeout: 15_000 });
    // Recepción no ve los documentos firmados ni «Nuevo consentimiento».
    await expect(page.getByRole('button', { name: /nuevo consentimiento/i })).toHaveCount(0);

    await section.getByRole('button', { name: 'Enviar a firmar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Enviar a firmar' });
    await expect(dialog.getByRole('region', { name: 'Destinatario' })).toContainText(
      'la***@example.com · firma Laura Castro Jiménez (paciente)',
    );
    await expectDialogInsideViewport(page, dialog);
    // Sin elegir nada, el modal dice qué falta (no solo deshabilita).
    await expect(dialog.getByText('Para enviar, elige el consentimiento y el profesional que firmará.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(dialog.getByText('Elige el consentimiento que quieres enviar.')).toBeVisible();
    await dialog.getByLabel('Consentimiento').selectOption({ label: TEMPLATE_TITLE });
    // Recepción no queda como profesional ni ve a recepción en la lista: cada uno con su rol.
    const professional = dialog.getByLabel('Profesional que firmará');
    await expect(professional).toHaveValue('');
    await expect(professional.locator('option', { hasText: 'Recepción' })).toHaveCount(0);
    await professional.selectOption({ label: `${DENTIST_NAME} · Odontólogo/a` });
    // Recepción también puede elegir el plan; sin él, el modal avisa de «No especificado».
    await expect(dialog.getByLabel(/plan de tratamiento/i)).toBeVisible();
    await dialog.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Enlace enviado a la***@example.com.')).toBeVisible();

    const row = signatureRows(page).first();
    await expect(row).toContainText(TEMPLATE_TITLE);
    await expect(row.getByText('Enviado', { exact: true })).toBeVisible();
    await expect(row).toContainText('a la***@example.com por Paola Martínez Ruiz');

    link = await linkFromMail(PATIENT_EMAIL, /(https?:\/\/\S+\/firmar\/[A-Za-z0-9_-]{43})/);
    expect(new URL(link).host).toBe(new URL(origin).host);
  });

  test('la paciente verifica el código y firma desde el móvil (390 px, sin sesión)', async ({ browser }) => {
    expect(link, 'el test anterior no dejó el enlace').not.toBe('');
    const context = await browser.newContext({
      locale: E2E_BROWSER_LOCALE,
      timezoneId: 'America/Bogota',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      const response = await page.goto(link);
      expect(response?.headers()['cache-control']).toBe('no-store');
      expect(response?.headers()['referrer-policy']).toBe('no-referrer');
      expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');

      await expect(page.getByText(/te enviaremos un código de 6 dígitos a la\*\*\*@example\.com/)).toBeVisible({
        timeout: 15_000,
      });
      // Antes del código no hay documento ni nombres.
      await expect(page.getByText(/Exodoncia/)).toHaveCount(0);
      await expectNoHorizontalScroll(page);

      await page.getByRole('button', { name: 'Enviarme el código' }).click();
      const codeInput = page.getByLabel('Código de 6 dígitos');
      await expect(codeInput).toBeVisible();
      const code = await linkFromMail(PATIENT_EMAIL, /Tu código de verificación es: (\d{6})/);

      await codeInput.fill(code === '000000' ? '111111' : '000000');
      await page.getByRole('button', { name: 'Ver el documento' }).click();
      await expect(page.getByText('Código incorrecto. Te quedan 4 intentos.')).toBeVisible();
      // El foco vuelve al código para escribir otro.
      await expect(codeInput).toBeFocused();

      await codeInput.fill(code);
      await page.getByRole('button', { name: 'Ver el documento' }).click();
      const document = page.getByRole('article', { name: 'Texto del documento' });
      await expect(document.getByRole('heading', { name: TEMPLATE_TITLE })).toBeVisible();
      await expect(document).toContainText('Laura Castro Jiménez');
      await expectNoHorizontalScroll(page);

      await page.getByRole('button', { name: 'Firmar' }).click();
      await expect(page.getByText('Confirma que leíste el documento completo.')).toBeVisible();
      await page.getByRole('checkbox', { name: /he leído el documento completo/i }).check();
      await drawSignature(page, page.getByRole('img', { name: 'Tu firma' }));
      await page.getByRole('button', { name: 'Firmar' }).click();
      await expect(page.getByRole('heading', { name: 'Documento firmado' })).toBeVisible();
      // La copia que puede imprimir lleva su firma.
      await expect(page.getByRole('img', { name: 'Firma de Laura Castro Jiménez' })).toBeVisible();
      await expect(page.getByRole('button', { name: /imprimir o guardar en pdf/i })).toBeVisible();
      await expectNoHorizontalScroll(page);

      // Usado: el mismo enlace ya no enseña nada.
      await page.goto(link);
      await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toBeVisible();
      await expect(page.getByText(/@example\.com/)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('recepción ve «Firmado por paciente» con las evidencias', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, RECEPTION_EMAIL, DEMO_PASSWORD);
    await page.goto(`${origin}/patients/${patientId}?tab=consents`);
    const row = signatureRows(page).first();
    await expect(row.getByText('Firmado por paciente', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/Código verificado el/);
    await expect(row).toContainText(/Firmado por el paciente el .* desde la IP /);
    await expect(row).toContainText('1 código incorrecto');
    // No la manda a una tabla que no ve: firmará el profesional elegido.
    await expect(row).toContainText(`Falta la firma de ${DENTIST_NAME} como profesional: la hará en la app.`);
  });

  test('el profesional firma en la app y el consentimiento queda «Completo»', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, DENTIST_EMAIL, DEMO_PASSWORD);
    await page.goto(`${origin}/patients/${patientId}?tab=consents`);
    const table = page.getByRole('table', { name: 'Consentimientos firmados' });
    const pending = table.getByRole('row').filter({ hasText: 'Falta firma del profesional' }).first();
    await expect(pending).toContainText(TEMPLATE_TITLE, { timeout: 15_000 });
    await pending.getByRole('button', { name: /firmar como profesional/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Firmar como profesional' });
    await drawSignature(page, dialog.getByRole('img', { name: `Firma del profesional · ${DENTIST_NAME}` }));
    await dialog.getByRole('button', { name: 'Firmar' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Consentimiento completo: firmaste como profesional.')).toBeVisible();
    await expect(signatureRows(page).first().getByText('Completo', { exact: true })).toBeVisible();
    await expect(signatureRows(page).first()).toContainText(/Completo: el profesional firmó el/);
  });

  // DX-422: la API genera en segundo plano el PDF firmado (con su página de
  // evidencias) y lo archiva en los documentos del paciente.
  for (const { width, height, label } of [
    { width: 1440, height: 900, label: '1440' },
    { width: 390, height: 844, label: '390 px' },
  ]) {
    test(`recepción descarga el PDF firmado desde la fila del envío (${label})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await loginAs(page, origin, RECEPTION_EMAIL, DEMO_PASSWORD);
      await page.goto(`${origin}/patients/${patientId}?tab=consents`);
      const row = signatureRows(page).first();
      await expect(row.getByText('Completo', { exact: true })).toBeVisible({ timeout: 15_000 });
      // La cola lo genera en segundos; mientras, la fila dice «Generando…».
      await expect(async () => {
        await page.reload();
        await expect(signatureRows(page).first()).toContainText('PDF firmado archivado en Documentos del paciente.', {
          timeout: 2_000,
        });
      }).toPass({ timeout: 30_000 });
      const button = signatureRows(page).first().getByRole('button', { name: `Descargar PDF de ${TEMPLATE_TITLE}` });
      await expect(button).toBeVisible();
      await expectNoHorizontalScroll(page);
      const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
      expect(download.suggestedFilename()).toMatch(/^Consentimiento firmado - .+\.pdf$/);
    });
  }
});

