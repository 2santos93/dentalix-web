import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-151): documentos del paciente en la ficha, a 1440 y 390.
 *
 *   1. Pestaña vacía; se eligen un PNG, un PDF y un SVG: el SVG se rechaza en el
 *      navegador con el mensaje en español y SIN petición a la API; el PNG
 *      (foto, diente 36) y el PDF (remisión) se suben con progreso y quedan
 *      «Subido».
 *   2. Un PDF de ~19 MB pasa por el rewrite `/api/v1` de Next (límite de
 *      cuerpo del proxy) con la subida estrangulada para ver el progreso.
 *   3. Filtros por categoría y por diente.
 *   4. Visor: el PDF en `<iframe>` a 1440; a 390 solo el enlace para abrirlo
 *      en otra pestaña. Descarga con el nombre original. Anulación con motivo:
 *      la fila sale tachada con el motivo.
 *   5. Desde el odontograma, «Documentos del diente 36» abre la pestaña
 *      filtrada por ese diente.
 *   6. A 390 px no hay scroll horizontal (pestaña, cola y visor).
 *
 * Con E2E_QA_DIR definido guarda capturas en claro y oscuro de cada pantalla.
 * Requiere API y web levantadas (ver playwright.config.ts y support/urls.ts).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;

// PNG de 1×1 válido (cabecera real: la API detecta el tipo por el contenido).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** PDF mínimo válido; `padding` bytes de comentario para hacerlo grande. */
function pdf(padding = 0): Buffer {
  const body = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj',
    'trailer << /Root 1 0 R >>',
  ].join('\n');
  const pad = padding > 0 ? `\n%${'0'.repeat(padding)}` : '';
  return Buffer.from(`${body}${pad}\n%%EOF\n`, 'latin1');
}

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const UNSUPPORTED = 'Tipo de archivo no admitido. Sube PDF, JPG, PNG, HEIC, Word (.docx) o DICOM.';

/** Captura en claro y en oscuro (solo con E2E_QA_DIR). Deja la página en claro. */
async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    // Solo para la captura: deja terminar los `transition-colors` del cambio de tema.
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(QA_DIR, `${name}-${scheme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Fila de la tabla de documentos con ese nombre (en escritorio o tarjeta en móvil). */
function documentRow(panel: Locator, name: string): Locator {
  return panel.getByRole('row').filter({ hasText: name });
}

test('subir, filtrar, ver, descargar y anular documentos; acceso desde el diente (1440 y 390)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = await registerAndLogin(page, {
    subdomain: `test-clinic-docs-${suffix}`.slice(0, 63),
    clinicName: `Clinica Documentos ${suffix}`,
    fullName: 'Dra Documentos',
    email: `test.user.docs.${suffix}@example.com`,
    password,
  });
  const token = await accessTokenOf(page);
  const res = await page.request.post(`${API_URL}/patients`, {
    headers: { 'X-Tenant-Host': new URL(origin).host, Authorization: `Bearer ${token}` },
    data: {
      firstName: 'Ana',
      lastName: `Documentos${suffix}`.slice(0, 40),
      docType: 'CC',
      docNumber: `DOC${suffix}`.slice(0, 20),
      sex: 'F',
    },
  });
  expect(res.ok(), `POST /patients falló: ${await res.text()}`).toBeTruthy();
  const patient = (await res.json()) as { id: string };

  // Cada POST de subida que sale del navegador (por el proxy del mismo origen).
  const uploadPath = `/api/v1/patients/${patient.id}/documents`;
  const uploads: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === uploadPath) uploads.push(req.url());
  });

  const panel = page.locator('#tabpanel-documents');
  const queue = panel.getByRole('list', { name: 'Archivos por subir' });
  const input = panel.getByLabel('Archivos para subir');

  // --- 1. Vacía; PNG + PDF + SVG ---
  await page.goto(`${origin}/patients/${patient.id}?tab=documents`);
  await expect(panel.getByText('Sin documentos')).toBeVisible({ timeout: 15_000 });
  await shoot(page, 'documentos-vacio-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await shoot(page, 'documentos-vacio-390');
  await page.setViewportSize({ width: 1440, height: 900 });

  await input.setInputFiles([
    { name: 'radiografia.png', mimeType: 'image/png', buffer: PNG },
    { name: 'remision.pdf', mimeType: 'application/pdf', buffer: pdf() },
    { name: 'malicioso.svg', mimeType: 'image/svg+xml', buffer: SVG },
  ]);
  const svgRow = queue.getByRole('listitem', { name: 'malicioso.svg' });
  await expect(svgRow).toContainText(UNSUPPORTED);
  await expect(svgRow).toHaveAttribute('data-status', 'error');
  // El SVG no ofrece «Reintentar» ni «Subir»: el pre-chequeo no pidió nada.
  await expect(svgRow.getByRole('button', { name: /Reintentar|Subir/ })).toHaveCount(0);
  expect(uploads, 'el SVG no se envía a la API').toEqual([]);

  const pngRow = queue.getByRole('listitem', { name: 'radiografia.png' });
  await pngRow.getByLabel('Categoría').selectOption('PHOTO');
  await pngRow.getByLabel('Dientes (opcional)').fill('36');
  await pngRow.getByLabel('Dientes (opcional)').press('Enter');
  await expect(pngRow.getByRole('button', { name: 'Quitar el diente 36' })).toBeVisible();
  const pdfRow = queue.getByRole('listitem', { name: 'remision.pdf' });
  await pdfRow.getByLabel('Categoría').selectOption('REFERRAL');
  await shoot(page, 'documentos-cola-1440');

  await panel.getByRole('button', { name: 'Subir 2 archivos' }).click();
  for (const row of [pngRow, pdfRow]) {
    await expect(row.getByText('Subido')).toBeVisible({ timeout: 15_000 });
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  }
  expect(uploads, 'una petición por archivo válido').toHaveLength(2);
  await expect(documentRow(panel, 'radiografia.png')).toBeVisible();
  await expect(documentRow(panel, 'remision.pdf')).toBeVisible();
  await shoot(page, 'documentos-subido-1440');

  // --- 2. ~19 MB por el rewrite de Next, con la subida estrangulada ---
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: 4 * 1024 * 1024,
  });
  const big = pdf(19 * 1024 * 1024);
  await input.setInputFiles({ name: 'estudio-grande.pdf', mimeType: 'application/pdf', buffer: big });
  const bigRow = queue.getByRole('listitem', { name: 'estudio-grande.pdf' });
  const bigResponse = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === uploadPath,
    { timeout: 120_000 },
  );
  await bigRow.getByRole('button', { name: 'Subir estudio-grande.pdf' }).click();
  // Progreso a medias, visible en la fila.
  await expect
    .poll(async () => Number(await bigRow.getByRole('progressbar').getAttribute('aria-valuenow')), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  const midway = Number(await bigRow.getByRole('progressbar').getAttribute('aria-valuenow'));
  if (midway < 100) await shoot(page, 'documentos-progreso-1440');
  const bigRes = await bigResponse;
  expect(bigRes.status(), `subida de ${big.length} bytes por el proxy: ${await bigRes.text()}`).toBe(201);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await expect(bigRow.getByText('Subido')).toBeVisible({ timeout: 15_000 });
  await expect(documentRow(panel, 'estudio-grande.pdf')).toBeVisible();
  await panel.getByRole('button', { name: 'Quitar los subidos' }).click();
  // El SVG rechazado se queda en la cola hasta que se quita a mano.
  await expect(queue.getByRole('listitem')).toHaveCount(1);
  await svgRow.getByRole('button', { name: 'Quitar malicioso.svg' }).click();
  await expect(queue).toHaveCount(0);

  // --- 3. Filtros ---
  const filters = panel.getByRole('group', { name: 'Filtrar documentos' });
  await filters.getByLabel('Categoría').selectOption('PHOTO');
  await expect(documentRow(panel, 'radiografia.png')).toBeVisible();
  await expect(documentRow(panel, 'remision.pdf')).toHaveCount(0);
  await expect(documentRow(panel, 'estudio-grande.pdf')).toHaveCount(0);
  await filters.getByLabel('Categoría').selectOption('');
  await filters.getByLabel('Diente').selectOption('36');
  await expect(documentRow(panel, 'radiografia.png')).toBeVisible();
  await expect(documentRow(panel, 'remision.pdf')).toHaveCount(0);
  await filters.scrollIntoViewIfNeeded();
  await shoot(page, 'documentos-filtro-diente-1440');
  await filters.getByLabel('Diente').selectOption('');
  await expect(documentRow(panel, 'remision.pdf')).toBeVisible();
  await documentRow(panel, 'remision.pdf').scrollIntoViewIfNeeded();
  await shoot(page, 'documentos-lista-1440');

  // --- 4a. Visor del PDF a 1440: iframe con la URL firmada ---
  const signed = page.waitForResponse((r) => /\/files\/signed/.test(r.url()) && r.request().resourceType() === 'document');
  await panel.getByRole('button', { name: 'Ver remision.pdf' }).click();
  const viewer = page.getByRole('dialog', { name: 'remision.pdf' });
  const frame = viewer.locator('iframe[title="Vista previa de remision.pdf"]');
  await expect(frame).toBeVisible({ timeout: 15_000 });
  const signedRes = await signed;
  expect(signedRes.status(), 'el iframe carga la URL firmada').toBe(200);
  expect(signedRes.headers()['content-type']).toContain('application/pdf');
  expect(signedRes.headers()['x-frame-options'] ?? '', 'la API deja enmarcar el PDF').not.toMatch(/deny/i);
  await expect(viewer.getByRole('link', { name: 'Abrir en otra pestaña' })).toBeVisible();
  await page.waitForTimeout(500);
  await shoot(page, 'documentos-visor-1440');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  // --- 4b. Descarga con el nombre original ---
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Descargar remision.pdf' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('remision.pdf');

  // --- 4c. Anular con motivo ---
  await panel.getByRole('button', { name: 'Anular radiografia.png' }).click();
  const voidDialog = page.getByRole('dialog', { name: 'Anular documento' });
  await voidDialog.getByLabel('Motivo de la anulación').fill('Foto de otro paciente');
  await voidDialog.getByRole('button', { name: 'Anular documento' }).click();
  await expect(voidDialog).toBeHidden();
  const voidedRow = documentRow(panel, 'radiografia.png');
  await expect(voidedRow).toHaveAttribute('data-status', 'VOIDED');
  await expect(voidedRow.getByText('Anulado', { exact: true })).toBeVisible();
  await expect(voidedRow).toContainText('Motivo: Foto de otro paciente');
  await expect(voidedRow.locator('span:not(.sr-only)', { hasText: /^radiografia\.png$/ })).toHaveCSS(
    'text-decoration-line',
    'line-through',
  );
  await expect(panel.getByRole('button', { name: 'Anular radiografia.png' })).toHaveCount(0);
  await voidedRow.scrollIntoViewIfNeeded();
  await shoot(page, 'documentos-anulado-1440');

  // --- 5. Desde el odontograma ---
  await page.goto(`${origin}/patients/${patient.id}?tab=odontogram&tooth=36`);
  await page.getByRole('link', { name: 'Documentos del diente 36' }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(/tab=documents/);
  await expect(page).toHaveURL(/tooth=36/);
  await expect(filters.getByLabel('Diente')).toHaveValue('36', { timeout: 15_000 });
  await expect(documentRow(panel, 'radiografia.png')).toBeVisible();
  await expect(documentRow(panel, 'remision.pdf')).toHaveCount(0);
  // Lo que se suba desde aquí trae el diente puesto.
  await input.setInputFiles({ name: 'periapical-36.png', mimeType: 'image/png', buffer: PNG });
  const toothRow = queue.getByRole('listitem', { name: 'periapical-36.png' });
  await expect(toothRow.getByRole('button', { name: 'Quitar el diente 36' })).toBeVisible();

  // --- 6. Móvil 390 px ---
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await toothRow.getByRole('button', { name: 'Subir periapical-36.png' }).click();
  await expect(toothRow.getByText('Subido')).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await toothRow.scrollIntoViewIfNeeded();
  await shoot(page, 'documentos-subido-390');

  await page.goto(`${origin}/patients/${patient.id}?tab=documents`);
  await expect(documentRow(panel, 'remision.pdf')).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await documentRow(panel, 'remision.pdf').scrollIntoViewIfNeeded();
  await shoot(page, 'documentos-lista-390');

  await panel.getByRole('button', { name: 'Ver remision.pdf' }).click();
  await expect(viewer.getByRole('link', { name: 'Abrir' })).toBeVisible({ timeout: 15_000 });
  await expect(viewer.locator('iframe')).toHaveCount(0);
  await expect(viewer.getByRole('link', { name: 'Abrir en otra pestaña' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await shoot(page, 'documentos-visor-390');
  await page.keyboard.press('Escape');

  // La imagen sí se ve dentro a 390.
  await panel.getByRole('button', { name: 'Ver periapical-36.png' }).click();
  const imageViewer = page.getByRole('dialog', { name: 'periapical-36.png' });
  await expect(imageViewer.getByRole('img', { name: 'periapical-36.png' })).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');

  await panel.getByRole('button', { name: 'Anular periapical-36.png' }).click();
  await expect(voidDialog).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shoot(page, 'documentos-anular-390');
});
