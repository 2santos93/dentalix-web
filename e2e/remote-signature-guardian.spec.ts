import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { apiLogin, apiPost, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR, linkFromMail, mailMark } from './support/mail';
import { shot } from './support/qa-shot';
import { E2E_BROWSER_LOCALE } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-060-bis: firma a distancia con tutor. La cláusula de representación
 * que DX-060 puso en la firma en la clínica también va en el enlace.
 *
 *   1. Recepción abre «Enviar a firmar» de una paciente menor (creada aquí en
 *      la demo, con su madre como responsable con email y documento): el
 *      modal pide nombre, documento y relación del tutor, precargados de la
 *      ficha. Si falta el documento, lo dice junto al campo y no envía.
 *   2. La madre abre el enlace a 390 px, sin sesión: el texto abre con la
 *      cláusula («Firma en representación del paciente: …, como su madre.») y
 *      bajo la firma dice «En representación de {paciente}»; firma, y la copia
 *      lo repite.
 *   3. El odontólogo firma como profesional y la vista imprimible lleva la
 *      cláusula y «En representación de {paciente}» bajo la firma del tutor.
 *
 * Estado compartido (DX-337): deja en la demo una paciente menor con su
 * responsable y un consentimiento completo (inmutable); no crea sedes ni
 * personal. Con E2E_QA_DIR deja capturas a 390 y 1440 en claro y oscuro.
 */
const origin = tenantOrigin(DEMO_SUBDOMAIN);
const RECEPTION_EMAIL = 'recepcion@demo.dentalix.app';
const DENTIST_EMAIL = 'dentista@demo.dentalix.app';
const DENTIST_NAME = 'Andrés Gómez Pérez';
const TEMPLATE_TITLE = 'Consentimiento informado — Exodoncia';

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PATIENT_FIRST = 'Valentina';
const PATIENT_LAST = `Rojas ${suffix}`;
const PATIENT_NAME = `${PATIENT_FIRST} ${PATIENT_LAST}`;
const GUARDIAN_NAME = `Carolina Rojas ${suffix}`;
const GUARDIAN_EMAIL = `carolina.dx060bis.${suffix}@example.com`;
const GUARDIAN_DOC = `V-${String(Date.now()).slice(-8)}`;

let patientId = '';
let link = '';

test.describe.configure({ mode: 'serial' });

/** Nació hace `years` años (el día civil de hoy, menos unos días). */
function bornYearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - 10);
  return d.toISOString().slice(0, 10);
}

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

/** «Firma en representación del paciente: {tutor}, identificado(a) con … {doc}, …, como su madre. …» */
const CLAUSE = new RegExp(
  `^Firma en representación del paciente: ${GUARDIAN_NAME}, identificado\\(a\\) con [^,]*${GUARDIAN_DOC}, ` +
    `otorga este consentimiento en nombre de ${PATIENT_NAME}, como su madre\\. ` +
    `Lo que este documento dice en primera persona lo declara ${GUARDIAN_NAME} en representación de ${PATIENT_NAME}\\.`,
);

test.describe('Firma a distancia con tutor (DX-060-bis)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)');

  test.beforeAll(async ({ request }) => {
    const session: ApiSession = await apiLogin(request, origin, RECEPTION_EMAIL, DEMO_PASSWORD);
    ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: PATIENT_FIRST,
      lastName: PATIENT_LAST,
      docType: 'NATIONAL_ID',
      docNumber: `M${suffix}`.slice(0, 20).toUpperCase(),
      sex: 'F',
      birthDate: bornYearsAgo(10),
    }));
    await apiPost(request, session, `/patients/${patientId}/responsible-parties`, {
      fullName: GUARDIAN_NAME,
      email: GUARDIAN_EMAIL,
      relationship: 'MOTHER',
      isPayer: true,
      receivesNotices: true,
      docType: 'NATIONAL_ID',
      docNumber: GUARDIAN_DOC,
    });
  });

  test('recepción envía a firmar: el modal pide los datos del tutor, precargados de la ficha', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, RECEPTION_EMAIL, DEMO_PASSWORD);
    await page.goto(`${origin}/patients/${patientId}?tab=consents`);
    const section = page.getByTestId('patient-signature-requests');
    await expect(section.getByRole('heading', { name: 'Firma a distancia' })).toBeVisible({ timeout: 15_000 });
    await section.getByRole('button', { name: 'Enviar a firmar' }).click();

    const dialog = page.getByRole('dialog', { name: 'Enviar a firmar' });
    await expect(dialog.getByRole('region', { name: 'Destinatario' })).toContainText(
      `firma ${GUARDIAN_NAME}, su responsable (la persona es menor de edad)`,
    );
    const tutor = dialog.getByRole('group', { name: 'Quién firma en nombre del paciente' });
    await expect(tutor.getByLabel('Nombre del tutor')).toHaveValue(GUARDIAN_NAME);
    await expect(tutor.getByLabel('Documento del tutor')).toHaveValue(new RegExp(`${GUARDIAN_DOC}$`));
    await expect(tutor.getByLabel(/Relación con el paciente/)).toHaveValue('MOTHER');
    await expect(
      tutor.getByText('El documento dirá quién firma en nombre del paciente y su relación con él.'),
    ).toBeVisible();

    await dialog.getByLabel('Consentimiento').selectOption({ label: TEMPLATE_TITLE });
    await dialog.getByLabel('Profesional que firmará').selectOption({ label: `${DENTIST_NAME} · Odontólogo/a` });
    await expectDialogInsideViewport(page, dialog);
    await shot(page, 'modal-tutor', 1440);

    // Sin el documento del tutor no se envía: lo dice junto al campo.
    const documentInput = tutor.getByLabel('Documento del tutor');
    const prefilled = await documentInput.inputValue();
    await documentInput.fill('');
    await dialog.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(dialog.getByText('Escribe el documento del tutor: el documento lo nombra.')).toBeVisible();
    await expect(documentInput).toBeFocused();
    await shot(page, 'modal-tutor-error', 1440);
    await documentInput.fill(prefilled);

    await page.setViewportSize({ width: 390, height: 844 });
    await expectDialogInsideViewport(page, dialog);
    await expectNoHorizontalScroll(page);
    await tutor.scrollIntoViewIfNeeded();
    await shot(page, 'modal-tutor', 390);

    const sentSince = mailMark();
    await dialog.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(dialog).toBeHidden();
    await expect(signatureRows(page).first()).toContainText(TEMPLATE_TITLE);
    link = await linkFromMail(GUARDIAN_EMAIL, /(https?:\/\/\S+\/firmar\/[A-Za-z0-9_-]{43})/, { since: sentSince });
  });

  test('la madre abre el enlace: la cláusula abre el texto y firma «en representación de» (390 px, sin sesión)', async ({
    browser,
  }) => {
    expect(link, 'el test anterior no dejó el enlace').not.toBe('');
    const context = await browser.newContext({
      locale: E2E_BROWSER_LOCALE,
      timezoneId: 'America/Caracas',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto(link);
      const codeSince = mailMark();
      await page.getByRole('button', { name: 'Enviarme el código' }).click({ timeout: 15_000 });
      const code = await linkFromMail(GUARDIAN_EMAIL, /Tu código de verificación es: (\d{6})/, { since: codeSince });
      await page.getByLabel('Código de 6 dígitos').fill(code);
      await page.getByRole('button', { name: 'Ver el documento' }).click();

      const document = page.getByRole('article', { name: 'Texto del documento' });
      await expect(document.getByRole('heading', { name: TEMPLATE_TITLE })).toBeVisible();
      const body = document.locator('p.whitespace-pre-line').first();
      await expect(body).toHaveText(CLAUSE);
      await expect(document).toContainText(`Firma: ${GUARDIAN_NAME}, como responsable del paciente`);
      // El documento del tutor ya va en el texto: no se lo vuelve a pedir.
      await expect(page.getByLabel('Tu documento de identidad')).toHaveCount(0);
      await expect(page.getByText(`En representación de ${PATIENT_NAME}`, { exact: true })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, 'enlace-documento', 390);
      await page.getByText(`En representación de ${PATIENT_NAME}`, { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 'enlace-firma', 390);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'enlace-documento', 1440);
      await page.getByText(`En representación de ${PATIENT_NAME}`, { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 'enlace-firma', 1440);
      await page.setViewportSize({ width: 390, height: 844 });

      await page.getByRole('checkbox', { name: /he leído el documento completo/i }).check();
      await drawSignature(page, page.getByRole('img', { name: 'Tu firma' }));
      await page.getByRole('button', { name: 'Firmar' }).click();
      await expect(page.getByRole('heading', { name: 'Documento firmado' })).toBeFocused();
      const copyBlock = page.getByRole('article');
      await expect(copyBlock.locator('p.whitespace-pre-line').first()).toHaveText(CLAUSE);
      await expect(copyBlock.getByText(`En representación de ${PATIENT_NAME}`, { exact: true })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await copyBlock.getByText(`En representación de ${PATIENT_NAME}`, { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 'enlace-copia', 390);
      await page.setViewportSize({ width: 1440, height: 900 });
      await copyBlock.getByText(`En representación de ${PATIENT_NAME}`, { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 'enlace-copia', 1440);
    } finally {
      await context.close();
    }
  });

  test('el profesional firma y la vista imprimible lleva la cláusula y «En representación de»', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, DENTIST_EMAIL, DEMO_PASSWORD);
    await page.goto(`${origin}/patients/${patientId}?tab=consents`);
    const table = page.getByRole('table', { name: 'Consentimientos firmados' });
    const pending = table.getByRole('row').filter({ hasText: 'Falta firma del profesional' }).first();
    await expect(pending).toContainText(TEMPLATE_TITLE, { timeout: 15_000 });
    await pending.getByRole('button', { name: /^Acciones de/ }).click();
    await page.getByRole('menuitem', { name: /firmar como profesional/i }).click();
    const dialog = page.getByRole('dialog', { name: 'Firmar como profesional' });
    await drawSignature(page, dialog.getByRole('img', { name: `Firma del profesional · ${DENTIST_NAME}` }));
    await dialog.getByRole('button', { name: 'Firmar' }).click();
    await expect(dialog).toBeHidden();
    await expect(signatureRows(page).first().getByText('Completo', { exact: true })).toBeVisible();

    const session = await apiLogin(request, origin, DENTIST_EMAIL, DEMO_PASSWORD);
    const res = await request.get(`${API_URL}/patients/${patientId}/signature-requests`, {
      headers: session.headers,
    });
    expect(res.ok()).toBeTruthy();
    const [sent] = (await res.json()) as { consentId: string | null; signerType: string }[];
    expect(sent.signerType).toBe('GUARDIAN');
    expect(sent.consentId).toBeTruthy();

    await page.goto(`${origin}/print/patients/${patientId}/consents/${sent.consentId}`);
    const printed = page.locator('article.consent-print-root');
    await expect(printed.locator('div.whitespace-pre-line')).toHaveText(CLAUSE, { timeout: 15_000 });
    const signatures = printed.getByRole('region', { name: 'Firmas' });
    await expect(signatures).toContainText(GUARDIAN_NAME);
    await expect(signatures.getByText(`En representación de ${PATIENT_NAME}`, { exact: true })).toBeVisible();
    await shot(page, 'imprimible', 1440);
    await signatures.scrollIntoViewIfNeeded();
    await shot(page, 'imprimible-firmas', 1440);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalScroll(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'imprimible', 390);
    await signatures.scrollIntoViewIfNeeded();
    await shot(page, 'imprimible-firmas', 390);
  });
});
