import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-324): la receta única sigue los ajustes de la clínica y el formato
 * de su sede.
 *
 * Una clínica nueva por corrida con dos sedes creadas por la API:
 * - A: `en-US` / `America/New_York` / USD / 12 h;
 * - B: `de-DE` / `Europe/Berlin` / EUR / 24 h.
 *
 *  1. El ADMIN enciende en Ajustes › Recetas la cantidad en letras y el nº de
 *     historia clínica y pone 10 días: la siguiente receta (emitida en B) los
 *     sigue, con las fechas en DD.MM.YYYY y el PDF en una hoja.
 *  2. La misma receta abierta con A activa sigue en el formato de B.
 *  3. Con el nº de historia clínica exigido, un paciente sin documento no se
 *     puede recetar: el modal dice qué falta y sigue abierto.
 *  4. Apagar las letras no cambia la receta ya emitida; la siguiente sale sin ellas.
 *  5. La especialidad que se pone en Personal sale bajo el profesional.
 *  6. La auditoría dice «Receta: cantidad en letras no → sí; …».
 *  7. Un DENTIST no ve Ajustes › Recetas y la página le enseña un solo candado.
 *  8. A 390 px no hay scroll horizontal en los ajustes, el modal y la vista
 *     imprimible; capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `rxset-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Irene Ajustes', email: `admin.rxset.${suffix}@example.com` };
const dentist = { fullName: 'Diego Dentista', email: `dentist.rxset.${suffix}@example.com` };
const QA_DIR = process.env.E2E_QA_DIR;

// `country` es un dato de la sede, no una regla (R14). La receta no lo lee; su
// formato sale de la moneda, la zona, el idioma y el reloj de cada sede.
const SEDE_A = { name: 'Sede A', country: 'US', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' } satisfies RegionalSettings & { name: string };
const SEDE_B = { name: 'Sede B', country: 'DE', currency: 'EUR', timeZone: 'Europe/Berlin', locale: 'de-DE', hourCycle: 'h23' } satisfies RegionalSettings & { name: string };

const AUDIT_DETAIL = 'Receta: cantidad en letras no → sí; nº de historia clínica exigido no → sí; validez 30 → 10 días';
const HC_NOTE = 'Esta clínica exige el documento del paciente como nº de historia clínica.';
const HC_REQUIRED = 'Falta el número de historia clínica: registra el documento del paciente en sus datos';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

let session: ApiSession;
let adminUserId: string;
const ids: Record<'A' | 'B', string> = { A: '', B: '' };
const patients = { withDoc: '', withoutDoc: '' };
const docNumber = `RXSET${suffix}`.slice(0, 20);
/** Rutas de la vista imprimible: con letras y nº de HC (1) y sin letras (4). */
const printed = { wordsHc: '', plain: '' };

/** Las llamadas de la sesión en una sede (`X-Location-Id`). */
function at(sede: 'A' | 'B'): ApiSession {
  return { ...session, headers: { ...session.headers, 'X-Location-Id': ids[sede] } };
}

/** `DD.MM.YYYY` del día civil de hoy en la zona de B, sin pasar por el helper de la web. */
function todayInB(): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: SEDE_B.timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

const amoxicillin = {
  activeIngredient: 'Amoxicilina',
  concentration: '500 mg',
  pharmaceuticalForm: 'Cápsula',
  route: 'Oral',
  dose: '1 cápsula',
  frequency: 'Cada 8 horas',
  durationDays: 7,
  totalQuantity: 21,
  quantityUnit: 'cápsulas',
};

/** Emite por la API, en B, una receta de amoxicilina y devuelve la ruta de su vista imprimible. */
async function issueInB(request: APIRequestContext, patientId: string): Promise<string> {
  const rx = await apiPost<{ id: string }>(request, at('B'), `/patients/${patientId}/prescriptions`, {
    items: [amoxicillin],
  });
  return `/print/patients/${patientId}/prescriptions/${rx.id}`;
}

async function putSettings(
  request: APIRequestContext,
  body: { printQuantityInWords: boolean; requireClinicalRecordNumber: boolean; validityDays: number },
): Promise<void> {
  const res = await request.put(`${API_URL}/prescriptions/settings`, { headers: session.headers, data: body });
  expect(res.ok(), `PUT /prescriptions/settings falló: ${await res.text()}`).toBeTruthy();
}

/** Entra como el ADMIN con `sede` activa (la sede activa vive en localStorage). */
async function loginAt(page: Page, sede: 'A' | 'B'): Promise<void> {
  await loginAs(page, origin, admin.email, password);
  await activateSede(page, sede);
}

async function activateSede(page: Page, sede: 'A' | 'B'): Promise<void> {
  await page.evaluate((id) => window.localStorage.setItem('dentalix.activeLocationId', id), ids[sede]);
}

/** El valor (`<dd>`) de un dato del documento por su etiqueta exacta. */
function field(page: Page, label: string) {
  return page.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
}

/** Abre la vista imprimible; `window.print` no hace nada para no bloquear la prueba. */
async function openPrint(page: Page, href: string): Promise<void> {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`${origin}${href}`);
  await expect(page.getByRole('heading', { name: 'Receta', exact: true })).toBeVisible({ timeout: 15_000 });
}

async function openSettings(page: Page) {
  await page.goto(`${origin}/settings/recetas`);
  const words = page.getByRole('switch', { name: 'Cantidad en letras' });
  await expect(words).toBeVisible({ timeout: 15_000 });
  return words;
}

async function openModal(page: Page, patientId: string) {
  await page.goto(`${origin}/patients/${patientId}?tab=prescriptions`);
  const panel = page.locator('#tabpanel-prescriptions');
  await panel.getByRole('button', { name: 'Nueva receta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva receta' });
  await expect(dialog.getByText(/^Se emite desde /)).toBeVisible({ timeout: 15_000 });
  return { panel, dialog };
}

async function fillAmoxicillin(dialog: Locator): Promise<void> {
  await dialog.getByLabel('Principio activo (DCI)').fill(amoxicillin.activeIngredient);
  await dialog.getByLabel('Concentración').fill(amoxicillin.concentration);
  await dialog.getByLabel('Forma farmacéutica').fill(amoxicillin.pharmaceuticalForm);
  await dialog.getByLabel('Vía de administración').fill(amoxicillin.route);
  await dialog.getByLabel('Dosis').fill(amoxicillin.dose);
  await dialog.getByLabel('Frecuencia').fill(amoxicillin.frequency);
  await dialog.getByLabel('Duración (días)').fill(String(amoxicillin.durationDays));
  await dialog.getByLabel('Cantidad total').fill(String(amoxicillin.totalQuantity));
  await dialog.getByLabel('Unidad').fill(amoxicillin.quantityUnit);
}

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  // Sin el hover del último clic y sin transiciones de color a medias.
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: false });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Ajustes Receta ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  ids.A = await createLocationViaApi(request, session, SEDE_A);
  ids.B = await createLocationViaApi(request, session, SEDE_B);
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  adminUserId = staff.find((m) => m.fullName === admin.fullName)!.userId;
  patients.withDoc = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Clara',
      lastName: `Ajustes${suffix}`.slice(0, 40),
      docType: 'PASSPORT',
      docNumber,
      birthDate: '1990-04-12',
      sex: 'F',
    })
  ).id;
  patients.withoutDoc = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Sin',
      lastName: `Documento${suffix}`.slice(0, 40),
      docType: 'PASSPORT',
      sex: 'M',
    })
  ).id;
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
});

test('admin turns on words and HC and sets 10 days; the next prescription follows them', async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAt(page, 'B');

  // Una clínica nueva nace sin letras, sin nº de HC y con 30 días.
  const words = await openSettings(page);
  const record = page.getByRole('switch', { name: 'Exigir el nº de historia clínica' });
  const validity = page.getByLabel('Validez (días)');
  const save = page.getByRole('button', { name: 'Guardar' });
  await expect(words).toHaveAttribute('aria-checked', 'false');
  await expect(record).toHaveAttribute('aria-checked', 'false');
  await expect(validity).toHaveValue('30');
  await expect(save).toBeDisabled();
  await words.click();
  await record.click();
  await validity.fill('10');
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Ajustes de la receta guardados.' })).toBeVisible();
  await expect(words).toHaveAttribute('aria-checked', 'true');
  await expect(record).toHaveAttribute('aria-checked', 'true');
  await expect(save).toBeDisabled();
  const stored = await request.get(`${API_URL}/prescriptions/settings`, { headers: session.headers });
  expect(await stored.json()).toEqual({ printQuantityInWords: true, requireClinicalRecordNumber: true, validityDays: 10 });

  // La siguiente receta, en B, los sigue.
  const { panel, dialog } = await openModal(page, patients.withDoc);
  await expect(dialog.getByText('Se emite desde Sede B · válida 10 días.', { exact: true })).toBeVisible();
  await expect(dialog.getByText(HC_NOTE, { exact: true })).toBeVisible();
  await dialog.getByLabel('Tu nº de registro profesional').fill('RP-324');
  await fillAmoxicillin(dialog);
  // La pista de las letras sale porque la clínica las imprime.
  await expect(dialog.getByText('Se imprime también en letras.')).toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Emitir receta' });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const table = panel.getByRole('table', { name: 'Recetas del paciente' });
  await expect(table).toContainText('Amoxicilina 500 mg · 21 cápsulas');

  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  const [printPage] = await Promise.all([
    page.context().waitForEvent('page'),
    table.getByRole('link', { name: /Ver e imprimir/ }).click(),
  ]);
  await expect(printPage.getByRole('heading', { name: 'Receta', exact: true })).toBeVisible({ timeout: 15_000 });
  printed.wordsHc = new URL(printPage.url()).pathname;
  await expect(printPage.getByText('21 (veintiuno) cápsulas', { exact: true })).toBeVisible();
  await expect(field(printPage, 'Nº de historia clínica')).toHaveText(docNumber);
  await expect(field(printPage, 'Válida hasta')).toContainText('(10 días)');
  await expect(field(printPage, 'Válida desde')).toHaveText(todayInB());
  await expect(field(printPage, 'Válida hasta')).toHaveText(/^\d{2}\.\d{2}\.\d{4} \(10 días\)$/);
  await printPage.emulateMedia({ media: 'print' });
  await expect(printPage.getByRole('toolbar', { name: 'Acciones de la receta' })).toBeHidden();
  const pdf = (await printPage.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1);
  await printPage.close();
});

test('the same prescription opened with A active still prints in B\'s format', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAt(page, 'A');
  await openPrint(page, printed.wordsHc);
  // R11: el formato es el de la sede de la receta, no el de la sede activa.
  await expect(field(page, 'Válida desde')).toHaveText(todayInB());
  await expect(field(page, 'Válida hasta')).toHaveText(/^\d{2}\.\d{2}\.\d{4} \(10 días\)$/);
  await expect(field(page, 'Fecha de emisión')).toHaveText(/^\d{2}\.\d{2}\.\d{4}/);
  await expect(page.getByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).toHaveCount(0);
});

test('a patient without document cannot be prescribed while HC is required', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAt(page, 'B');
  const { panel, dialog } = await openModal(page, patients.withoutDoc);
  await expect(dialog.getByText(HC_NOTE, { exact: true })).toBeVisible();
  await fillAmoxicillin(dialog);
  const submit = dialog.getByRole('button', { name: 'Emitir receta' });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  const summary = dialog.getByRole('alert').filter({ hasText: HC_REQUIRED });
  await expect(summary).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel.getByText('Este paciente no tiene recetas.')).toBeVisible();

  // La API dice lo mismo, en cualquier sede.
  for (const sede of ['A', 'B'] as const) {
    const res = await request.post(`${API_URL}/patients/${patients.withoutDoc}/prescriptions`, {
      headers: at(sede).headers,
      data: { items: [amoxicillin] },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain(HC_REQUIRED);
  }
});

test('turning words off does not change an issued prescription', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await putSettings(request, { printQuantityInWords: false, requireClinicalRecordNumber: true, validityDays: 10 });
  printed.plain = await issueInB(request, patients.withDoc);
  await loginAt(page, 'B');

  // La emitida con letras las conserva (R9: la foto se basta sola).
  await openPrint(page, printed.wordsHc);
  await expect(page.getByText('21 (veintiuno) cápsulas', { exact: true })).toBeVisible();

  // La siguiente sale sin ellas.
  await openPrint(page, printed.plain);
  await expect(page.getByText('21 cápsulas', { exact: true })).toBeVisible();
  await expect(page.getByText(/veintiuno/)).toHaveCount(0);
  await expect(field(page, 'Nº de historia clínica')).toHaveText(docNumber);
});

test('specialty set in Personal prints under the professional', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAt(page, 'B');
  await page.goto(`${origin}/staff/${adminUserId}`);
  const specialty = page.getByLabel('Especialidad (opcional)');
  await expect(specialty).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Nº de registro profesional')).toHaveValue('RP-324');
  await specialty.fill('Endodoncia');
  const saved = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && new URL(res.url()).pathname.endsWith(`/staff/${adminUserId}`),
  );
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  expect((await saved).ok()).toBe(true);

  const href = await issueInB(request, patients.withDoc);
  await openPrint(page, href);
  const professional = page.getByRole('region', { name: 'Profesional que prescribe' });
  const labels = await professional.locator('dt').allTextContents();
  expect(labels.slice(0, 3)).toEqual(['Profesional que prescribe', 'Nº de registro profesional', 'Especialidad']);
  await expect(field(page, 'Profesional que prescribe')).toHaveText(admin.fullName);
  await expect(field(page, 'Especialidad')).toHaveText('Endodoncia');
});

test('the audit log shows «Receta: cantidad en letras no → sí; …»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAt(page, 'B');
  await page.goto(`${origin}/settings/auditoria`);
  const table = page.getByRole('table', { name: 'Registro de auditoría' });
  await expect(table).toBeVisible({ timeout: 15_000 });
  const row = table.getByRole('row').filter({ hasText: AUDIT_DETAIL });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Ajustes de la clínica');
  await expect(row).toContainText(admin.fullName);
  // El cambio por la API (solo las letras) dice solo eso.
  await expect(table.getByRole('row').filter({ hasText: 'Receta: cantidad en letras sí → no' })).toHaveCount(1);
});

test('a DENTIST does not see Ajustes › Recetas and the page shows exactly one lock', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/settings`);
  const links = page.getByRole('main').getByRole('listitem').getByRole('link');
  await expect(links.first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('main').getByRole('link', { name: /Recetas/ })).toHaveCount(0);

  await page.goto(`${origin}/settings/recetas`);
  const main = page.getByRole('main');
  await expect(main.getByText('Solo administración cambia los datos de la receta.')).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText('Las recetas se emiten con los ajustes que fije administración.')).toBeVisible();
  await expect(main.locator('svg.lucide-lock')).toHaveCount(1);
  await expect(main.getByRole('switch')).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
  await expect(main.getByRole('heading', { name: 'Datos de la receta' })).toHaveCount(0);
});

test('390 px has no horizontal scroll in settings, modal and print view (captures at 390 and 1440, light and dark)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAt(page, 'B');

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const narrow = viewport.width === 390;

    await openSettings(page);
    if (narrow) {
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
    }
    await shoot(page, 'settings', viewport.width);

    const { dialog } = await openModal(page, patients.withDoc);
    await fillAmoxicillin(dialog);
    const issuer = dialog.getByText('Se emite desde Sede B · válida 10 días.', { exact: true });
    const note = dialog.getByText(HC_NOTE, { exact: true });
    await expect(note).toBeVisible();
    // La nota de HC va justo bajo la línea del emisor, dentro del diálogo.
    const [issuerBox, noteBox, dialogBox] = [await issuer.boundingBox(), await note.boundingBox(), await dialog.boundingBox()];
    expect(noteBox!.y).toBeGreaterThanOrEqual(issuerBox!.y + issuerBox!.height - 1);
    expect(noteBox!.x).toBeCloseTo(issuerBox!.x, 0);
    expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width);
    if (narrow) {
      await expectDialogInsideViewport(page, dialog);
      await expectNoHorizontalScroll(page);
    }
    await dialog.evaluate((el) => el.scrollTo(0, 0));
    await shoot(page, 'modal', viewport.width);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    for (const [name, href] of [
      ['print-words-hc', printed.wordsHc],
      ['print-plain', printed.plain],
    ] as const) {
      await openPrint(page, href);
      if (narrow) await expectNoHorizontalScroll(page);
      await shoot(page, name, viewport.width);
    }

    await page.goto(`${origin}/staff/${adminUserId}`);
    const specialty = page.getByLabel('Especialidad (opcional)');
    await expect(specialty).toHaveValue('Endodoncia', { timeout: 15_000 });
    await specialty.scrollIntoViewIfNeeded();
    if (narrow) await expectNoHorizontalScroll(page);
    await shoot(page, 'staff-specialty', viewport.width);

    await page.goto(`${origin}/settings/auditoria`);
    // B6: el registro es una tabla desde 640 px y una lista de tarjetas en el teléfono (DataList).
    const row = (
      narrow
        ? page.getByRole('list', { name: 'Registro de auditoría' }).getByRole('listitem')
        : page.getByRole('table', { name: 'Registro de auditoría' }).getByRole('row')
    ).filter({ hasText: AUDIT_DETAIL });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.scrollIntoViewIfNeeded();
    if (narrow) await expectNoHorizontalScroll(page);
    await shoot(page, 'audit', viewport.width);
  }
});
