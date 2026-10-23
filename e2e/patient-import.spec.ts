import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';

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
  test(`importar, revisar, confirmar y deshacer un lote (${viewport.name})`, async ({ page, request }) => {
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
      `CC;${docA};Ana;Importada${viewport.tag};03/05/1990;F;310 123 4567;ana${suffix}@example.com;Calle 10 # 1-20;Importado de la hoja anterior`,
      `CC;${docB};Luis;Importado${viewport.tag};;;;;;`,
      `CC;${docA};Ana;Repetida;;;;;;`,
      `CC;99${suffix};;SinNombre;31/02/1990;;;;;`,
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
    await expect(page.getByText(/autorización de datos \(Ley 1581\) pendiente/)).toBeVisible();
    await page.getByRole('button', { name: 'Importar 2 pacientes' }).click();
    await expect(page.getByText('Importado', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('2 de 2 filas procesadas')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx107-importado-${viewport.name}`);

    const [created] = await patientsWithDoc(request, host, docA);
    expect(created).toBeTruthy();
    await page.goto(`${origin}/patients/${created.id}`);
    await expect(page.getByText('Importado desde archivo')).toBeVisible();
    await expect(page.getByText(/Pendiente · importado sin autorización/)).toBeVisible();

    // Historial: deshacer el lote.
    await page.goto(`${origin}/settings/importar-pacientes`);
    const history = page.getByRole('list', { name: 'Importaciones de la clínica' });
    const row = history.getByRole('listitem').filter({ hasText: `pacientes-${viewport.name}.csv` }).first();
    await row.getByRole('button', { name: /Deshacer el lote/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Se retirarán los 2 pacientes');
    await dialog.getByRole('button', { name: 'Deshacer lote' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText('Deshecho: 2 pacientes retirados');
    expect(await patientsWithDoc(request, host, docA)).toHaveLength(0);
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page, 'main');
    await shoot(page, `dx107-historial-${viewport.name}`);
  });
}
