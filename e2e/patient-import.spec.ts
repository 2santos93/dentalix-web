import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { request as httpRequest } from 'node:http';
import { API_URL, WEB_PORT, tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { demoNationalIdName } from './support/demo';

/**
 * e2e (DX-107): Ajustes → Importar pacientes en la clínica demo, a 1440 y 390.
 *
 *   1. Subir un CSV con separador «;» (paso 1): el asistente propone el mapeo
 *      de columnas; a 390 px cada dato se apila (etiqueta sobre el selector) y
 *      ni la página ni `<main>` (que es quien hace scroll) se desplazan de lado.
 *   2. Validar (dry-run, paso 2): totales, el error y el duplicado por fila
 *      con su motivo en español; ningún paciente creado todavía.
 *   3. Confirmar (paso 3): avance hasta «Importado»; la ficha del importado
 *      dice «Importado desde archivo» y la autorización de datos pendiente.
 *   4. Historial: «Deshacer lote» con confirmación → «Deshecho» y el
 *      paciente ya no está.
 *
 * Y (DX-107 × DX-259) un CSV de 10.000 pacientes de más de 1 MB, el tope del
 * proxy `/api/v1` de la web: sube con progreso por la ruta de subida de la
 * importación (`/api/import-upload/*`, en streaming hacia la API), se valida
 * y se importa; un cuerpo de más de 1 MB a `/api/v1/*` sigue siendo el 413.
 * Con `E2E_WEB_PID` se mide además el RSS de la web durante la subida.
 *
 * Requiere la API con worker (APP_ROLE=all) y la demo sembrada
 * (`npm run seed:demo`). Con E2E_QA_DIR guarda capturas en claro y oscuro.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const QA_DIR = process.env.E2E_QA_DIR;

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^0-9]/g, '').slice(-6).padStart(6, '7');

async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(QA_DIR, `${name}-${scheme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function webLogin(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect
    .poll(async () => Boolean((await sessionCookie(page, origin))?.httpOnly), { timeout: 15_000 })
    .toBe(true);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

async function apiToken(request: APIRequestContext, host: string): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email: ADMIN_EMAIL, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `login falló: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Pacientes vivos con ese documento (búsqueda de la API). */
async function patientsWithDoc(request: APIRequestContext, host: string, doc: string) {
  const token = await apiToken(request, host);
  const res = await request.get(`${API_URL}/patients?query=${doc}`, {
    headers: { 'X-Tenant-Host': host, Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { items: { id: string; docNumber: string | null }[] };
  return body.items.filter((p) => p.docNumber === doc);
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900, tag: '1' },
  { name: 'movil', width: 390, height: 844, tag: '2' },
]) {
  test(`legacy «Tipo Doc» Cédula y columna «Cédula»: importar, revisar, confirmar y deshacer un lote (${viewport.name})`, async ({ page, request }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const host = new URL(origin).host;
    const docA = `61${viewport.tag}${suffix}1`;
    const docB = `61${viewport.tag}${suffix}2`;
    // Las mismas columnas que el CSV de ejemplo de la API: con ellas el mapeo
    // a 390 px llegó a sacar 3 px de <main> (QA D1).
    const csv = [
      'Tipo Doc;Cédula;Nombre;Apellidos;Fecha de nacimiento;Sexo;Celular;Correo;Dirección;Observaciones',
      `Cédula;${docA};Ana;Importada${viewport.tag};03/05/1990;F;310 123 4567;ana${suffix}@example.com;Calle 10 # 1-20;Importado de la hoja anterior`,
      `Cédula;${docB};Luis;Importado${viewport.tag};;;;;;`,
      `Cédula;${docA};Ana;Repetida;;;;;;`,
      `Cédula;99${suffix};;SinNombre;31/02/1990;;;;;`,
    ].join('\n');

    await webLogin(page, origin);
    await page.goto(`${origin}/settings/importar-pacientes`);
    await expect(page.getByRole('heading', { name: 'Importar pacientes', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historial de importaciones' })).toBeVisible();
    await shoot(page, `dx107-paso1-${viewport.name}`);

    // Paso 1 → 2: el archivo se lee y se propone el mapeo.
    await page.getByLabel('Archivo de pacientes (CSV o .xlsx)').setInputFiles({
      name: `pacientes-${viewport.name}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });
    await expect(page.getByText(`pacientes-${viewport.name}.csv · 4 filas`)).toBeVisible();
    const docSelect = page.getByRole('combobox', { name: /^Número de documento/ });
    await expect(docSelect).toHaveValue('Cédula');
    await expect(page.getByRole('combobox', { name: /^Teléfono$/ })).toHaveValue('Celular');
    if (viewport.width < 640) {
      const label = await page.locator('label', { hasText: 'Número de documento' }).first().boundingBox();
      const select = await docSelect.boundingBox();
      expect(label!.y + label!.height, 'la etiqueta va encima del selector').toBeLessThanOrEqual(select!.y + 1);
    }
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx107-mapeo-${viewport.name}`);

    // Paso 2: dry-run.
    await page.getByRole('button', { name: 'Validar archivo' }).click();
    const result = page.getByRole('region', { name: 'Resultado de la validación' });
    await expect(result).toBeVisible();
    await expect(result.getByText('Pacientes nuevos').locator('xpath=following-sibling::dd')).toHaveText('2');
    const issues = result.getByRole('table', { name: 'Errores y duplicados por fila' });
    await expect(issues).toContainText('Falta «Nombres».');
    await expect(issues).toContainText('Repetido en el archivo');
    await expect(issues).toContainText('La fecha de nacimiento no existe en el calendario.');
    expect(await patientsWithDoc(request, host, docA)).toHaveLength(0);
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx107-validacion-${viewport.name}`);

    // Paso 3: confirmar y seguir el avance.
    await result.getByRole('button', { name: 'Continuar' }).click();
    // DX-262: el paso «Saldos» es opcional.
    await page.getByRole('button', { name: 'Continuar sin saldos' }).click();
    await expect(page.getByText(/autorización de datos pendiente/)).toBeVisible();
    await page.getByRole('button', { name: 'Importar 2 pacientes' }).click();
    // El avance de ESTE lote, no el «Importado» de otro lote del historial
    // (los de otros specs comparten la demo): el lote puede seguir en cola.
    const progress = page.getByRole('region', { name: `Importación de pacientes-${viewport.name}.csv` });
    await expect(progress.getByText('Importado', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(progress.getByText('2 de 2 filas procesadas')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx107-importado-${viewport.name}`);

    const [created] = await patientsWithDoc(request, host, docA);
    expect(created).toBeTruthy();
    await page.goto(`${origin}/patients/${created.id}`);
    await expect(page.getByText('Importado desde archivo')).toBeVisible();
    // DX-327: el alias de uso en muchos países «Cédula» se guarda como el tipo
    // genérico, que se ve con el nombre local que le dio la clínica (V1: la
    // demo lo tiene); ni el valor ni la cabecera «Cédula» de la hoja salen por
    // su cuenta (las siglas de un solo país ya no son alias: Z1).
    const nationalIdName = await demoNationalIdName(request);
    await expect(page.getByText(`${nationalIdName} ${docA}`).first()).toBeVisible();
    const mainText = (await page.locator('main').innerText()).split(nationalIdName).join('');
    expect(mainText).not.toContain('Cédula');
    expect(mainText).not.toMatch(/\bCC\b/);
    await expect(page.getByText(/Pendiente · importado sin autorización/)).toBeVisible();

    // Historial: deshacer el lote.
    await page.goto(`${origin}/settings/importar-pacientes`);
    const history = page.getByRole('list', { name: 'Importaciones de la clínica' });
    const row = history.getByRole('listitem').filter({ hasText: `pacientes-${viewport.name}.csv` }).first();
    await row.getByRole('button', { name: /^Acciones de/ }).click();
    await page.getByRole('menuitem', { name: 'Deshacer lote', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Se retirarán los 2 pacientes');
    // DX-294: mientras la API deshace (aquí la retenemos), «Deshaciendo…» con
    // su avance; ni Escape cierra el diálogo ni se puede lanzar otro.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let undoCalls = 0;
    await page.route(/\/api\/v1\/patient-imports\/[^/]+\/undo$/, async (route) => {
      undoCalls += 1;
      await held;
      await route.continue();
    });
    await dialog.getByRole('button', { name: 'Deshacer lote' }).click();
    const busy = dialog.getByRole('button', { name: 'Deshaciendo…' });
    await expect(busy).toBeDisabled();
    await expect(dialog.getByRole('status')).toHaveText(
      'Deshaciendo el lote: retirando 2 pacientes. Puede tardar unos segundos; no cierres esta ventana.',
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shoot(page, `dx294-deshaciendo-${viewport.name}`);
    release();
    await expect(dialog).toBeHidden();
    await page.unroute(/\/api\/v1\/patient-imports\/[^/]+\/undo$/);
    expect(undoCalls).toBe(1);
    await expect(row).toContainText('Deshecho: 2 pacientes retirados');
    expect(await patientsWithDoc(request, host, docA)).toHaveLength(0);
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx107-historial-${viewport.name}`);
  });
}

/** RSS en bytes del proceso de la web (`E2E_WEB_PID`), o null si no se mide. */
function webRss(): number | null {
  const pid = process.env.E2E_WEB_PID;
  if (!pid) return null;
  const kb = /VmRSS:\s+(\d+)\s+kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1];
  return kb ? Number(kb) * 1024 : null;
}

/** CSV «;» de `rows` pacientes válidos, con filas largas como las de una exportación real. */
function legacyBigCsv(rows: number, docPrefix: string): Buffer {
  const lines = ['Tipo Doc;Cédula;Nombre;Apellidos;Fecha de nacimiento;Sexo;Celular;Correo;Dirección;Observaciones'];
  for (let i = 0; i < rows; i += 1) {
    const n = String(i).padStart(5, '0');
    lines.push(
      `Cédula;${docPrefix}${n};Paciente${n};Importado Masivo;03/05/1990;F;310 123 4567;paciente${docPrefix}${n}@example.com;` +
        `Calle 10 # 1-20 Barrio Centro;Paciente de la lista del programa anterior importado en lote`,
    );
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}

test('legacy «Tipo Doc» Cédula, DX-107 × DX-259: un CSV de 10.000 pacientes (> 1 MB) sube con progreso, se valida y se importa', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const fileName = `pacientes-10000-${suffix}.csv`;
  const csv = legacyBigCsv(10_000, `8${suffix}`);
  expect(csv.length, 'más que el tope de 1 MB del proxy /api/v1').toBeGreaterThan(1024 * 1024);
  expect(csv.length).toBeLessThan(5 * 1024 * 1024);

  await webLogin(page, origin);
  await page.goto(`${origin}/settings/importar-pacientes`);
  await expect(page.getByRole('heading', { name: 'Importar pacientes', level: 1 })).toBeVisible();

  // Nada del multipart va por /api/v1 (lo cortaría el proxy): solo las
  // peticiones pequeñas de siempre.
  const viaApiProxy: { path: string; bytes: number }[] = [];
  const uploads: string[] = [];
  page.on('request', (req) => {
    const { pathname } = new URL(req.url());
    if (pathname.startsWith('/api/v1/')) viaApiProxy.push({ path: pathname, bytes: req.postDataBuffer()?.length ?? 0 });
    if (pathname.startsWith('/api/import-upload/')) uploads.push(pathname);
  });

  // Subida estrangulada para ver el progreso a medias.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: 512 * 1024,
  });
  const baseline = webRss();
  let peak = baseline ?? 0;
  const sampler = baseline === null ? null : setInterval(() => (peak = Math.max(peak, webRss() ?? 0)), 25);
  const inspected = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/import-upload/inspect', {
    timeout: 60_000,
  });
  try {
    await page.getByLabel('Archivo de pacientes (CSV o .xlsx)').setInputFiles({
      name: fileName,
      mimeType: 'text/csv',
      buffer: csv,
    });
    const bar = page.getByRole('progressbar', { name: 'Subida del archivo' });
    await expect
      .poll(async () => Number((await bar.getAttribute('aria-valuenow').catch(() => null)) ?? -1), { timeout: 20_000 })
      .toBeGreaterThan(0);
    await expect(page.getByRole('status')).toContainText(/Subiendo el archivo… \d+ %/);
    await shoot(page, 'dx107-subida-grande');
    const res = await inspected;
    expect(res.status(), await res.text()).toBe(200);
  } finally {
    if (sampler) clearInterval(sampler);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }
  if (baseline !== null) {
    const grewMb = (peak - baseline) / (1024 * 1024);
    console.info(`[DX-107] RSS de la web durante la subida de ${(csv.length / 1048576).toFixed(2)} MB: +${grewMb.toFixed(2)} MB`);
  }
  await expect(page.getByText(`${fileName} · 10.000 filas`)).toBeVisible();

  // Dry-run de las 10.000 filas.
  await page.getByRole('button', { name: 'Validar archivo' }).click();
  const result = page.getByRole('region', { name: 'Resultado de la validación' });
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(result.getByText('Pacientes nuevos').locator('xpath=following-sibling::dd')).toHaveText(/^10[.\s]?000$/);
  await expect(result.getByText('Ninguna fila con errores ni duplicados.')).toBeVisible();

  // Importar y seguir el avance.
  await result.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar sin saldos' }).click();
  await page.getByRole('button', { name: /^Importar 10[.\s]?000 pacientes$/ }).click();
  // El avance del lote, no el «Importado» de otro lote del historial.
  await expect(page.getByText(/^10[.\s]?000 de 10[.\s]?000 filas procesadas$/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Importado', { exact: true }).first()).toBeVisible();

  expect(uploads).toEqual(['/api/import-upload/inspect', '/api/import-upload/validate']);
  for (const req of viaApiProxy) {
    expect(req.bytes, `${req.path} por el proxy /api/v1`).toBeLessThan(64 * 1024);
  }

  // Deja la demo como estaba: deshacer el lote.
  await page.goto(`${origin}/settings/importar-pacientes`);
  const history = page.getByRole('list', { name: 'Importaciones de la clínica' });
  const row = history.getByRole('listitem').filter({ hasText: fileName }).first();
  await row.getByRole('button', { name: /^Acciones de/ }).click();
    await page.getByRole('menuitem', { name: 'Deshacer lote', exact: true }).click();
  const dialog = page.getByRole('dialog');
  // DX-294: el deshacer de 10.000 recién importados responde por el proxy de
  // la web (corte a 30 s) con 200, de una vez y en pocos segundos.
  const undone = page.waitForResponse(
    (r) => /\/api\/v1\/patient-imports\/[^/]+\/undo$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
    { timeout: 60_000 },
  );
  const startedAt = Date.now();
  await dialog.getByRole('button', { name: 'Deshacer lote' }).click();
  const res = await undone;
  const undoMs = Date.now() - startedAt;
  console.info(`[DX-294] deshacer 10.000 por la web: ${res.status()} en ${undoMs} ms`);
  expect(res.status(), await res.text()).toBe(200);
  expect(undoMs, 'muy por debajo del corte de 30 s del proxy').toBeLessThan(15_000);
  await expect(dialog).toBeHidden();
  await expect(row).toContainText(/Deshecho: 10[.\s\u202f]?000 pacientes retirados/);
});

/**
 * POST a la web que anuncia `length` bytes pero solo manda el primer trozo y
 * espera la respuesta: así se ve lo que responde la web ANTES de leer el
 * cuerpo (un cliente que siguiera escribiendo tras el cierre vería EPIPE).
 */
function postDeclaringLength(
  path: string,
  length: number,
  headers: Record<string, string>,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: 'localhost', port: Number(WEB_PORT), path, method: 'POST', headers: { ...headers, 'Content-Length': length } },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => {
          req.destroy();
          resolve({ status: res.statusCode ?? 0, json: JSON.parse(text) });
        });
      },
    );
    req.on('error', reject);
    req.write(Buffer.alloc(64 * 1024, 0x61));
  });
}

test('DX-107 × DX-259: el tope de 1 MB de /api/v1 sigue en pie (también en la ruta de la importación) y la ruta de subida exige sesión y 5 MB', async ({
  request,
}) => {
  const origin = tenantOrigin(DEMO_SUBDOMAIN);
  const host = new URL(origin).host;
  const token = await apiToken(request, host);
  // baseURL = la web en localhost (Node no resuelve *.localhost): el tenant va
  // en X-Tenant-Host, como lo manda el navegador.
  const tenant = { 'X-Tenant-Host': host };
  const multipart = (bytes: number) => ({
    file: { name: 'pacientes.csv', mimeType: 'text/csv', buffer: Buffer.alloc(bytes, 0x61) },
  });

  // Por el proxy /api/v1, con sesión y todo: 413 del proxy, sin llegar a la API.
  for (const path of ['/api/v1/patient-imports/inspect', '/api/v1/patient-imports']) {
    const res = await request.post(path, {
      headers: { ...tenant, Authorization: `Bearer ${token}` },
      multipart: multipart(1536 * 1024),
    });
    expect(res.status(), path).toBe(413);
    expect(await res.json()).toMatchObject({ statusCode: 413, message: 'La petición es demasiado grande.' });
  }
  // Otra ruta cualquiera de /api/v1: igual.
  const other = await request.post('/api/v1/patients', {
    headers: { ...tenant, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: Buffer.alloc(1536 * 1024, 0x61),
  });
  expect(other.status()).toBe(413);
  expect(await other.json()).toMatchObject({ statusCode: 413, message: 'La petición es demasiado grande.' });

  // La ruta de subida de la importación: sin sesión, 401 sin leer el cuerpo…
  const anonymous = await request.post('/api/import-upload/inspect', {
    headers: tenant,
    multipart: multipart(4 * 1024 * 1024),
  });
  expect(anonymous.status()).toBe(401);
  expect(await anonymous.json()).toMatchObject({ statusCode: 401 });
  // …y más de 5 MB, el 413 de la importación en español, en cuanto llegan las
  // cabeceras (sin esperar al cuerpo: la web cierra la conexión).
  const tooBig = await postDeclaringLength('/api/import-upload/inspect', 5 * 1024 * 1024 + 128 * 1024, {
    ...tenant,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'multipart/form-data; boundary=x',
  });
  expect(tooBig.status).toBe(413);
  expect(tooBig.json).toMatchObject({
    statusCode: 413,
    message: 'El archivo pesa más de 5 MB. Divídelo en varios archivos más pequeños.',
  });
  // Un token de verdad pasa a la API, que responde lo suyo (aquí, 400 por el contenido).
  const ok = await request.post('/api/import-upload/inspect', {
    headers: { ...tenant, Authorization: `Bearer ${token}` },
    multipart: { file: { name: 'pacientes.csv', mimeType: 'text/csv', buffer: Buffer.from('solo una celda', 'utf8') } },
  });
  expect(ok.status(), await ok.text()).toBe(400);
});
