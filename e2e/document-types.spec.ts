import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * e2e (DX-327): tipos de documento genéricos, nombre libre del paciente y
 * nombre local de la clínica. Una clínica nueva por corrida.
 *
 *  1. El alta no propone ningún tipo y no avanza sin él.
 *  2. Un número con prefijo de letra («V-12345678») se guarda tal cual, y con
 *     el nombre libre «ID local» la cabecera dice «ID local V-12345678».
 *  3. El nombre libre sale en la cabecera, el panel de datos, el recibo y el
 *     consentimiento.
 *  4. Cambiar el tipo en la edición vacía el nombre libre.
 *  5. Un paciente `TAX_ID` imprime «Identificación fiscal …» en el recibo.
 *  6. El ADMIN pone «Documento A» a `NATIONAL_ID` en Ajustes: lo ven el alta,
 *     la ficha, la importación y un recibo nuevo; el recibo anterior conserva
 *     el nombre que congeló.
 *  7. Solo el ADMIN ve «Nombres de documentos»; RECEPCIÓN ve el aviso de
 *     permisos si llega por URL.
 *
 * Ningún nombre de documento de un país: los tipos genéricos y nombres
 * neutros («ID local», «Documento A»). Capturas a 390 y 1440 px, claro y
 * oscuro, en E2E_QA_DIR si está definido.
 */
const rawSuffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

// Lo fija el `beforeAll`: si un reintento lo vuelve a correr, la clínica nueva
// no choca con la anterior.
let suffix: string;
let origin: string;
let admin: ApiSession;
let adminEmail: string;
let receptionEmail: string;
let templateTitle: string;

// Mismo formateador que la app (`formatCurrency`, locale `es`): solo la cifra.
const cop = new Intl.NumberFormat('es', { style: 'currency', currency: 'COP' });
const figure = (amount: number) => cop.format(amount).split(/\s/)[0];

/**
 * La captura `${name}-${width}-${scheme}.png` a 1440 y 390 px, en claro y
 * oscuro; deja la página a 1440. `target` se desplaza a la vista en cada ancho.
 * A 390 px comprueba además que la página no se desplaza de lado. Con `block:
 * 'nearest'` solo se desplaza si `target` no se ve (la ficha a 1440 enseña
 * cabecera y panel; a 390, el panel).
 */
async function shoot(
  page: Page,
  name: string,
  target?: Locator,
  block: ScrollLogicalPosition = 'center',
): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await target?.evaluate((el, at) => el.scrollIntoView({ block: at }), block);
    // Sin el hover del último clic y sin transiciones de color a medias.
    await page.mouse.move(0, 0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png`, fullPage: false });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

/** Alta por la API con un tipo genérico (y, si se da, el nombre libre). */
async function createPatient(
  request: APIRequestContext,
  body: { firstName: string; docType: string; docNumber: string; docTypeLabel?: string },
): Promise<string> {
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    lastName: `Documento${suffix}`.slice(0, 40),
    sex: 'F',
    ...body,
  });
  return patient.id;
}

/** Un plan en COP y un abono en efectivo del ADMIN: deja un recibo numerado. */
async function payOnce(request: APIRequestContext, patientId: string, amount: number): Promise<void> {
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patientId}/treatment-plans`, {
    currency: 'COP',
  });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/payments`, {
    amount,
    currency: 'COP',
    paidAt: new Date().toISOString(),
    method: 'CASH',
  });
}

/** Abre el estado de cuenta del paciente y el recibo del abono de `amount`. */
async function openReceipt(page: Page, patientId: string, amount: number): Promise<Locator> {
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const table = page.locator('#tabpanel-account-statement').getByRole('table', { name: /movimientos/i });
  await expect(table).toBeVisible({ timeout: 15_000 });
  await table.getByRole('row').filter({ hasText: figure(amount) }).getByRole('button', { name: /Recibo del abono/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Recibo de caja' });
  await expect(dialog.getByTestId('receipt-document')).toBeVisible({ timeout: 15_000 });
  return dialog;
}

/** La ficha del paciente, ya cargada en «Datos». */
async function openRecord(page: Page, patientId: string): Promise<void> {
  await page.goto(`${origin}/patients/${patientId}`);
  await expect(identity(page)).toBeVisible({ timeout: 15_000 });
}

const identity = (page: Page) => page.getByRole('list', { name: 'Datos de identificación' });

/** El valor (`<dd>`) de un campo del panel de datos, por su etiqueta exacta. */
const dataValue = (page: Page, label: string) =>
  page
    .locator('#tabpanel-data')
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }) => {
  suffix = `${rawSuffix.slice(0, 10)}${randomUUID().slice(0, 6)}`;
  adminEmail = `admin.doc.${suffix}@example.com`;
  receptionEmail = `recepcion.doc.${suffix}@example.com`;
  templateTitle = `Consentimiento ${suffix}`;
  const request = await playwright.request.newContext();
  try {
    admin = await registerClinicViaApi(request, {
      subdomain: `doc-${suffix}`,
      clinicName: `Clinica Documentos ${suffix}`,
      fullName: 'Dra Documentos',
      email: adminEmail,
      password,
    });
    origin = admin.origin;
    await addStaffViaApi(request, admin, {
      fullName: 'Recepción Documentos',
      email: receptionEmail,
      role: 'RECEPTION',
      password,
    });
    await apiPost(request, admin, '/consent-templates', {
      title: templateTitle,
      body: 'Yo, {{paciente}} ({{documento}}), autorizo a {{clinica}}. Fecha: {{fecha}}.',
    });
  } finally {
    await request.dispose();
  }
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
});

test('the create form proposes no document type and requires one', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/patients/new`);
  const type = page.getByLabel('Tipo de documento');
  await expect(type).toHaveValue('');
  await expect(type.locator('option:checked')).toHaveText('Elige el tipo');
  await expect(type.locator('option')).toHaveText([
    'Elige el tipo',
    'Documento nacional',
    'Pasaporte',
    'Permiso de residencia',
    'Identificación fiscal',
    'Otro documento',
  ]);

  let posted = false;
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/patients')) posted = true;
  });
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellido', { exact: true }).fill(`SinTipo${suffix}`.slice(0, 40));
  await page.getByRole('button', { name: /siguiente/i }).click();
  await expect(page.getByText('Nombre, apellido y tipo de documento son obligatorios para continuar.')).toBeVisible();
  await expect(page.getByText('Elige el tipo de documento.')).toBeVisible();
  await expect(type).toHaveAttribute('aria-invalid', 'true');
  await expect(type).toBeFocused();
  await expect(page).toHaveURL(/\/patients\/new$/);
  expect(posted).toBe(false);
});

test('a national number with a letter prefix is saved and shown as typed', async ({ page }) => {
  const docNumber = 'V-12345678';
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/patients/new`);
  await page.getByLabel('Nombre', { exact: true }).fill('Valeria');
  await page.getByLabel('Apellido', { exact: true }).fill(`Prefijo${suffix}`.slice(0, 40));
  const type = page.getByLabel('Tipo de documento');
  await type.selectOption('NATIONAL_ID');
  await page.getByLabel('Número de documento').fill(docNumber);
  await page.getByLabel('Nombre del documento (opcional)').fill('ID local');
  await expect(type.locator('option:checked')).toHaveText('Documento nacional');
  await shoot(page, 'patient-create', type);

  await page.getByRole('button', { name: /Autorización de datos/ }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(identity(page)).toContainText(`ID local ${docNumber}`);
  await expect(dataValue(page, 'Número de documento')).toHaveText(docNumber);
});

test('a patient created with a type and a free label shows it in the header, the data panel, a receipt and a consent', async ({
  page,
}) => {
  const docNumber = `E-8${suffix.replace(/\D/g, '').padEnd(7, '1').slice(0, 7)}`;
  const amount = 61_000;
  const patientId = await createPatient(page.request, {
    firstName: 'Luisa',
    docType: 'NATIONAL_ID',
    docNumber,
    docTypeLabel: 'ID local',
  });
  await payOnce(page.request, patientId, amount);
  await loginAs(page, origin, adminEmail, password);

  await openRecord(page, patientId);
  await expect(identity(page)).toContainText(`ID local ${docNumber}`);
  await expect(dataValue(page, 'Tipo de documento')).toHaveText('Documento nacional');
  await expect(dataValue(page, 'Nombre del documento')).toHaveText('ID local');
  await shoot(page, 'patient-record', page.locator('#tabpanel-data dl').first(), 'nearest');

  const receipt = await openReceipt(page, patientId, amount);
  await expect(receipt.getByTestId('receipt-document')).toContainText(`ID local ******${docNumber.slice(-4)}`);
  await shoot(page, 'receipt', receipt.getByTestId('receipt-document'));
  await page.keyboard.press('Escape');

  await page.goto(`${origin}/patients/${patientId}?tab=consents`);
  await page.getByRole('button', { name: 'Nuevo consentimiento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo consentimiento' });
  await dialog.getByLabel('Plantilla').selectOption({ label: templateTitle });
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByRole('region', { name: 'Texto del consentimiento' })).toContainText(
    `(ID local ${docNumber})`,
  );
});

test('editing the type clears the free label', async ({ page }) => {
  const docNumber = `P-${suffix.slice(0, 8)}`;
  const patientId = await createPatient(page.request, {
    firstName: 'Marta',
    docType: 'NATIONAL_ID',
    docNumber,
    docTypeLabel: 'ID local',
  });
  await loginAs(page, origin, adminEmail, password);
  await openRecord(page, patientId);
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar paciente' });
  const label = dialog.getByLabel('Nombre del documento (opcional)');
  await expect(label).toHaveValue('ID local');
  await shoot(page, 'patient-edit', label);

  await dialog.getByLabel('Tipo de documento').selectOption('PASSPORT');
  await expect(label).toHaveValue('');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(identity(page)).toContainText(`Pasaporte ${docNumber}`);
  await expect(identity(page)).not.toContainText('ID local');
  await expect(dataValue(page, 'Tipo de documento')).toHaveText('Pasaporte');
  await expect(dataValue(page, 'Nombre del documento')).toHaveCount(0);

  await page.reload();
  await expect(identity(page)).toContainText(`Pasaporte ${docNumber}`, { timeout: 15_000 });
  const res = await page.request.get(`${API_URL}/patients/${patientId}`, { headers: admin.headers });
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ docType: 'PASSPORT', docTypeLabel: null });
});

test('a TAX_ID patient prints «Identificación fiscal …» on the receipt', async ({ page }) => {
  const docNumber = `TX${suffix.slice(0, 8)}`;
  const amount = 47_000;
  const patientId = await createPatient(page.request, { firstName: 'Tania', docType: 'TAX_ID', docNumber });
  await payOnce(page.request, patientId, amount);
  await loginAs(page, origin, adminEmail, password);
  const receipt = await openReceipt(page, patientId, amount);
  const doc = receipt.getByTestId('receipt-document');
  await expect(doc).toContainText(`Identificación fiscal ******${docNumber.slice(-4)}`);
  await expect(doc).not.toContainText(docNumber);
});

test('ADMIN sets a local name in Ajustes and it shows in the create form, the record and a new receipt; an old receipt keeps its frozen name', async ({
  page,
}) => {
  const docNumber = `NA${suffix.slice(0, 8)}`;
  const before = 52_000;
  const after = 53_000;
  const patientId = await createPatient(page.request, { firstName: 'Nora', docType: 'NATIONAL_ID', docNumber });
  await payOnce(page.request, patientId, before);
  await loginAs(page, origin, adminEmail, password);

  // Recibo emitido con el nombre genérico.
  let receipt = await openReceipt(page, patientId, before);
  await expect(receipt.getByTestId('receipt-document')).toContainText(`Documento nacional ******${docNumber.slice(-4)}`);
  await page.keyboard.press('Escape');

  // Ajustes → Nombres de documentos.
  await page.goto(`${origin}/settings`);
  await page.getByRole('main').getByRole('link', { name: /Nombres de documentos/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nombres de documentos' })).toBeVisible({ timeout: 15_000 });
  const national = page.getByRole('textbox', { name: 'Documento nacional', exact: true });
  await expect(national).toHaveValue('');
  await expect(national).toHaveAttribute('placeholder', 'Documento nacional');
  await national.fill('Documento A');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Nombres guardados.')).toBeVisible();
  await page.reload();
  await expect(national).toHaveValue('Documento A', { timeout: 15_000 });
  await national.fill('Documento A');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Nombres guardados.')).toBeVisible();
  await shoot(page, 'document-type-names', page.getByText('Nombres guardados.'));

  // El alta ofrece el nombre local (el valor sigue siendo el genérico).
  await page.goto(`${origin}/patients/new`);
  const type = page.getByLabel('Tipo de documento');
  await expect(type.locator('option[value="NATIONAL_ID"]')).toHaveText('Documento A');
  await expect(type).toHaveValue('');

  // La ficha.
  await openRecord(page, patientId);
  await expect(identity(page)).toContainText(`Documento A ${docNumber}`);
  await expect(dataValue(page, 'Tipo de documento')).toHaveText('Documento A');
  await expect(dataValue(page, 'Nombre del documento')).toHaveCount(0);

  // Un recibo nuevo lleva el nombre local; el anterior conserva el congelado.
  await payOnce(page.request, patientId, after);
  receipt = await openReceipt(page, patientId, after);
  await expect(receipt.getByTestId('receipt-document')).toContainText(`Documento A ******${docNumber.slice(-4)}`);
  await page.keyboard.press('Escape');
  receipt = await openReceipt(page, patientId, before);
  await expect(receipt.getByTestId('receipt-document')).toContainText(`Documento nacional ******${docNumber.slice(-4)}`);
  await expect(receipt.getByTestId('receipt-document')).not.toContainText('Documento A');
  await page.keyboard.press('Escape');

  // La importación ofrece los nombres de la clínica y no propone tipo.
  await page.goto(`${origin}/settings/importar-pacientes`);
  await page.getByLabel('Archivo de pacientes (CSV o .xlsx)').setInputFiles({
    name: `pacientes-${suffix}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(`Documento;Nombre;Apellidos\nV-87654321;Ana;Importada${suffix}\n`, 'utf8'),
  });
  const fallback = page.getByRole('combobox', { name: 'Tipo de documento cuando la celda va vacía' });
  await expect(fallback).toHaveValue('', { timeout: 15_000 });
  await expect(fallback.locator('option:checked')).toHaveText('— Ninguno: la fila da error —');
  await expect(fallback.locator('option[value="NATIONAL_ID"]')).toHaveText('Documento A');
  await shoot(page, 'import-mapping', fallback);
});

test('only ADMIN sees «Nombres de documentos» in Ajustes', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/settings`);
  await expect(page.getByRole('main').getByRole('link', { name: /Nombres de documentos/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.context().clearCookies();

  await loginAs(page, origin, receptionEmail, password);
  await page.goto(`${origin}/settings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('main').getByRole('link').first()).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Nombres de documentos/ })).toHaveCount(0);

  await page.goto(`${origin}/settings/tipos-de-documento`);
  await expect(
    page.getByText('Solo un administrador puede cambiar los nombres de los documentos.'),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('textbox', { name: 'Documento nacional', exact: true })).toHaveCount(0);
});
