import { test, expect, type APIRequestContext, type Page } from './support/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { SEDE_TZ } from './support/clock';
import { E2E_BROWSER_LOCALE } from './support/regional';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * e2e (DX-572): órdenes de estudios y referencias externas.
 *
 *   1. A 1440 px, el ADMIN (con registro profesional) crea en Ajustes › Órdenes
 *      externas la plantilla «Radiografía panorámica» con su centro habitual.
 *   2. A 1440 y 390 px: Ficha › «Órdenes» → «Nueva orden» con esa plantilla y
 *      una nota → emitida; «Ver e imprimir» (con la nota) trae el PDF y su texto
 *      lleva el nº, el estudio y la nota. La orden sale en «Órdenes sin
 *      resultado». «Ligar resultado» → «Subir uno nuevo» (Radiografía) → la
 *      orden pasa a «Resultado recibido» y sale de «Órdenes sin resultado».
 *      Sin scroll horizontal y los diálogos dentro del viewport.
 *   3. A 390 px, recepción: ve la pestaña y la orden sin «Nueva orden» y sin la
 *      nota (solo «Lleva nota clínica»).
 *
 * Con E2E_QA_DIR definido guarda capturas.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;
const LICENSE = 'MPPS 51234';
const TEMPLATE = 'Radiografía panorámica';
const RECIPIENT = 'Centro de Imagen Los Palos Grandes';
const STUDY = 'Radiografía panorámica digital';
const NOTE = 'Control de terceros molares';
const admin = {
  clinicName: `Clinica Ordenes ${suffix}`,
  subdomain: `test-clinic-eo-${suffix}`,
  fullName: 'Dra Andreina Salazar',
  email: `test.user.eo.${suffix}@example.com`,
  password,
};
const reception = { fullName: 'Rita Recepción', email: `rita.eo.${suffix}@example.com`, role: 'RECEPTION', password };

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'movil', width: 390, height: 844 },
];

// PNG de 1×1 válido y distinto por pasada: la API detecta el tipo por el
// contenido y rechaza un archivo que ya está en la ficha (mismo sha256), y las
// dos pasadas (1440 y 390) suben al mismo paciente.
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png1px(gray: number): Buffer {
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]); // 1×1, 8 bits, gris
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.from([0, gray & 0xff]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function userIdOf(session: ApiSession): string {
  const token = session.headers.Authorization.replace('Bearer ', '');
  return (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { sub: string }).sub;
}

async function apiPatch(request: APIRequestContext, session: ApiSession, path: string, data: object): Promise<void> {
  const res = await request.patch(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
}

async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  await page.screenshot({ path: join(QA_DIR, `dx572-${name}.png`), fullPage: true });
}

test('órdenes externas: plantilla, emitir, PDF, ligar resultado y «Órdenes sin resultado» a 1440 y 390; recepción sin nota', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240_000);
  // --- Siembra por la API: clínica, recepción, registro del ADMIN y paciente ---
  const session = await registerClinicViaApi(request, admin);
  await addStaffViaApi(request, session, reception);
  await apiPatch(request, session, `/staff/${userIdOf(session)}`, { professionalLicense: LICENSE });
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Yusmary',
    lastName: `Rondon${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `V${suffix}`.slice(0, 12),
    sex: 'F',
    birthDate: '1985-06-20',
    phone: '+58 412 1234567',
  });

  await loginAs(page, session.origin, admin.email, password);

  // --- 1. Ajustes › Órdenes externas: la plantilla ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${session.origin}/settings/ordenes-externas`);
  await expect(page.getByRole('heading', { level: 1, name: 'Órdenes externas' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click({ timeout: 15_000 });
  const tplDialog = page.getByRole('dialog', { name: 'Nueva plantilla de orden' });
  await expect(tplDialog).toBeVisible();
  await tplDialog.getByLabel('Nombre', { exact: true }).fill(TEMPLATE);
  await tplDialog.getByLabel('Destinatario habitual (opcional)', { exact: true }).fill(RECIPIENT);
  await tplDialog.getByLabel('Estudio 1', { exact: true }).fill(STUDY);
  await tplDialog.getByRole('button', { name: 'Crear plantilla', exact: true }).click();
  await expect(tplDialog).toBeHidden();
  await expect(page.getByRole('table', { name: 'Plantillas de orden' }).getByText(TEMPLATE)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shoot(page, 'ajustes-escritorio');

  const panel = page.locator('#tabpanel-external-orders');
  for (const viewport of VIEWPORTS) {
    // --- 2. Emitir desde la pestaña con la plantilla ---
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${session.origin}/patients/${patient.id}?tab=external-orders`);
    await panel.getByRole('button', { name: 'Nueva orden', exact: true }).click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Nueva orden' });
    await expect(dialog).toBeVisible();
    const templateSelect = dialog.getByLabel('Plantilla (opcional)', { exact: true });
    await expect(templateSelect.getByRole('option', { name: TEMPLATE })).toHaveCount(1, { timeout: 15_000 });
    await templateSelect.selectOption({ label: TEMPLATE });
    await expect(dialog.getByLabel('Destinatario', { exact: true })).toHaveValue(RECIPIENT);
    await expect(dialog.getByLabel('Estudio 1', { exact: true })).toHaveValue(STUDY);
    await dialog.getByLabel('Nota clínica (opcional)', { exact: true }).fill(NOTE);
    await expectDialogInsideViewport(page, dialog);
    await shoot(page, `emitir-${viewport.name}`);
    await dialog.getByRole('button', { name: 'Emitir orden', exact: true }).click();
    const issued = dialog.getByText(/^Orden nº \d{6} emitida$/);
    await expect(issued).toBeVisible({ timeout: 15_000 });
    const numberLabel = /(\d{6})/.exec((await issued.textContent()) ?? '')![1];
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await expect(dialog).toBeHidden();

    // En la lista, emitida, con la nota (el ADMIN es rol clínico).
    const row = panel.getByRole(viewport.width < 640 ? 'listitem' : 'row').filter({ hasText: `nº ${numberLabel}` });
    await expect(row).toContainText('Emitida');
    await expect(row).toContainText(`Nota clínica: ${NOTE}`);
    await expectNoHorizontalScroll(page);
    await shoot(page, `lista-${viewport.name}`);

    // --- «Ver e imprimir» con la nota: el PDF trae el nº, el estudio y la nota ---
    await row.getByRole('button', { name: /^Ver e imprimir/ }).click();
    const pdfResponse = page.waitForResponse(
      (r) => /\/external-orders\/[^/]+\/pdf$/.test(new URL(r.url()).pathname) && r.status() === 200,
    );
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('menuitem', { name: 'Con la nota clínica', exact: true }).click();
    const popup = await popupPromise;
    const pdf = await pdfResponse;
    expect(new URL(pdf.url()).searchParams.get('withNote')).toBe('true');
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    // El cuerpo de la respuesta que abre la pestaña llega vacío a Playwright (el
    // visor del navegador lo consume), y el PDF usa la fuente Unicode incrustada
    // que `pdfText` no lee: se pide el mismo PDF a la API y se lee con pdftotext
    // (poppler, instalado en la CI).
    const again = await request.get(pdf.url(), { headers: session.headers });
    expect(again.status()).toBe(200);
    const pdfPath = join(await mkdtemp(join(tmpdir(), 'dx572-')), 'orden.pdf');
    await writeFile(pdfPath, await again.body());
    const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
    expect(text).toContain(numberLabel);
    expect(text).toContain(STUDY);
    expect(text).toContain(NOTE);
    await popup.close();

    // --- Sale en «Órdenes sin resultado» ---
    await page.goto(`${session.origin}/ordenes-sin-resultado`);
    await expect(page.getByRole('heading', { level: 1, name: 'Órdenes sin resultado' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('main').getByText(new RegExp(`nº ${numberLabel}`))).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
    await shoot(page, `sin-resultado-${viewport.name}`);

    // --- Subir un documento y ligarlo: «Resultado recibido» ---
    await page.goto(`${session.origin}/patients/${patient.id}?tab=external-orders`);
    const liveRow = panel.getByRole(viewport.width < 640 ? 'listitem' : 'row').filter({ hasText: `nº ${numberLabel}` });
    await liveRow.getByRole('button', { name: /^Acciones de / }).click({ timeout: 15_000 });
    await page.getByRole('menuitem', { name: 'Ligar resultado', exact: true }).click();
    const linkDialog = page.getByRole('dialog', { name: 'Ligar resultado' });
    await expect(linkDialog).toBeVisible();
    await linkDialog.getByRole('radio', { name: 'Subir uno nuevo', exact: true }).click();
    await linkDialog
      .getByLabel('Archivo', { exact: true })
      .setInputFiles({ name: `panoramica-${viewport.name}.png`, mimeType: 'image/png', buffer: png1px(viewport.width % 256) });
    await linkDialog.getByRole('radio', { name: 'Radiografía', exact: true }).check();
    await expectDialogInsideViewport(page, linkDialog);
    await shoot(page, `ligar-${viewport.name}`);
    await linkDialog.getByRole('button', { name: 'Ligar resultado', exact: true }).click();
    await expect(linkDialog).toBeHidden({ timeout: 30_000 });
    await expect(liveRow).toContainText('Resultado recibido');
    await expect(liveRow.getByRole('button', { name: /^Ver resultado/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // --- Ya no está en «Órdenes sin resultado» ---
    await page.goto(`${session.origin}/ordenes-sin-resultado`);
    await expect(page.getByRole('heading', { level: 1, name: 'Órdenes sin resultado' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No hay órdenes sin resultado en esta sede')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('main').getByText(new RegExp(`nº ${numberLabel}`))).toHaveCount(0);
  }

  // --- 3. Recepción, en el teléfono: ve la orden sin la nota y sin «Nueva orden» ---
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: SEDE_TZ,
    locale: E2E_BROWSER_LOCALE,
  });
  const rita = await context.newPage();
  await loginAs(rita, session.origin, reception.email, password);
  await rita.goto(`${session.origin}/patients/${patient.id}?tab=external-orders`);
  const ritaPanel = rita.locator('#tabpanel-external-orders');
  await expect(ritaPanel.getByText('Lleva nota clínica').first()).toBeVisible({ timeout: 15_000 });
  await expect(ritaPanel.getByText(RECIPIENT).first()).toBeVisible();
  await expect(ritaPanel.getByRole('button', { name: 'Nueva orden', exact: true })).toHaveCount(0);
  await expect(ritaPanel.getByText(NOTE)).toHaveCount(0);
  await expectNoHorizontalScroll(rita);
  await shoot(rita, 'recepcion-movil');
  await context.close();
});
