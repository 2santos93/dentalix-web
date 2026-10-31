import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-191): registro de implantes, tarjeta imprimible y búsqueda por lote.
 *
 *   1. Odontograma → diente 36 → «Registrar implante»: el formulario abre con
 *      el diente puesto; se registra el implante y, desde la sección, el pilar.
 *   2. «Tarjeta de implante» abre la vista imprimible: nombre y documento del
 *      paciente, centro y los dos componentes, sin base legal de un país
 *      (DX-325); «Imprimir» registra la entrega;
 *      el PDF sale en UNA hoja en A4 y en carta.
 *   3. Ajustes → Implantes: el lote devuelve los dos pacientes que lo
 *      recibieron y se exporta a CSV.
 *   4. A 390 px no hay scroll horizontal (sección, formulario, tarjeta y
 *      búsqueda).
 *
 * Requiere API y web levantadas (ver playwright.config.ts y support/urls.ts).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-impl-${suffix}`;
const email = `test.user.impl.${suffix}@example.com`;
const password = 'Password123!';
const LOT = `LOT-${suffix}`.slice(0, 40).toUpperCase();
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/**
 * La captura `${name}-${width}-${scheme}.png` a 1440 y 390 px, en claro y
 * oscuro, sin scroll horizontal; deja la página a 1440.
 */
async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalScroll(page);
    // Sin el hover del último clic y sin transiciones de color a medias.
    await page.mouse.move(0, 0);
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

function api(request: APIRequestContext, origin: string, token: string) {
  const headers = { 'X-Tenant-Host': new URL(origin).host, Authorization: `Bearer ${token}` };
  return {
    async post<T>(path: string, data: object): Promise<T> {
      const res = await request.post(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
    async patch(path: string, data: object): Promise<void> {
      const res = await request.patch(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
    },
    async get<T>(path: string): Promise<T> {
      const res = await request.get(`${API_URL}${path}`, { headers });
      expect(res.ok(), `GET ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
  };
}

test('registrar desde el odontograma, imprimir la tarjeta y buscar por lote (1440 y 390)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Implantes ${suffix}`,
    fullName: 'Dra Implantes',
    email,
    password,
  });
  const admin = api(page.request, origin, await accessTokenOf(page));
  const newPatient = (firstName: string, doc: string) =>
    admin.post<{ id: string }>('/patients', {
      firstName,
      lastName: `Implante${suffix}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber: `${doc}${suffix}`.slice(0, 20),
      sex: 'F',
    });
  const patient = await newPatient('Lucía', 'IM1');
  const other = await newPatient('Mario', 'IM2');

  // --- 1. Desde el odontograma, con el diente puesto ---
  await page.goto(`${origin}/patients/${patient.id}?tab=odontogram&tooth=36`);
  await page.getByRole('link', { name: 'Registrar implante en el diente 36' }).click({
    timeout: 15_000,
  });
  const dialog = page.getByRole('dialog', { name: 'Registrar implante' });
  await expect(dialog.getByLabel('Diente (FDI)')).toHaveValue('36');
  await dialog.getByLabel('Fabricante').fill('Straumann');
  await dialog.getByLabel('Marca o sistema').fill('BLT');
  await dialog.getByLabel('Referencia (REF)').fill('021.5310');
  await dialog.getByLabel('Lote').fill(LOT);
  await dialog.getByLabel('Diámetro (mm)').fill('4,1');
  await dialog.getByLabel('Longitud (mm)').fill('10');
  await dialog.getByRole('button', { name: 'Registrar implante' }).click();
  await expect(dialog).toBeHidden();

  const panel = page.locator('#tabpanel-implants');
  const tooth36 = panel.getByRole('list', { name: 'Implantes del diente 36' });
  await expect(tooth36).toContainText('021.5310');
  await expect(tooth36).toContainText(LOT);

  // El pilar, desde la propia sección.
  await panel.getByRole('button', { name: 'Registrar implante' }).click();
  await dialog.getByLabel('Diente (FDI)').fill('36');
  await dialog.getByLabel('Tipo de componente').selectOption('ABUTMENT');
  await dialog.getByLabel('Fabricante').fill('Straumann');
  await dialog.getByLabel('Referencia (REF)').fill('RC-ABUT-4');
  await dialog.getByLabel('Lote').fill('LOT-PILAR-7');
  await dialog.getByRole('button', { name: 'Registrar implante' }).click();
  await expect(dialog).toBeHidden();
  await expect(tooth36.getByRole('listitem')).toHaveCount(2);

  // --- 2. Tarjeta imprimible: una hoja en A4 y en carta ---
  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  const [cardPage] = await Promise.all([
    page.context().waitForEvent('page'),
    tooth36.getByRole('link', { name: /Tarjeta de implante/ }).first().click(),
  ]);
  const card = cardPage.getByRole('article');
  await expect(cardPage.getByRole('heading', { name: 'Tarjeta de implante' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(card).toContainText(`Lucía Implante${suffix}`.slice(0, 46));
  await expect(card).toContainText(`Documento nacional ${`IM1${suffix}`.slice(0, 20)}`);
  await expect(card).toContainText(`Clinica Implantes ${suffix}`);
  await expect(card).toContainText('021.5310');
  await expect(card).toContainText('RC-ABUT-4');
  // DX-325: la tarjeta no cita la norma de ningún país.
  await expect(card).not.toContainText(/Res\.|Reglamento|RD \d|\(CO\)|\(ES\)/);
  await shoot(cardPage, 'implant-card');
  await cardPage.getByRole('button', { name: 'Imprimir y registrar la entrega' }).click();
  await expect(card).toContainText('Tarjeta entregada al paciente el');
  await cardPage.emulateMedia({ media: 'print' });
  await expect(cardPage.getByRole('toolbar', { name: /tarjeta de implante/i })).toBeHidden();
  for (const format of ['A4', 'Letter'] as const) {
    const pdf = (await cardPage.pdf({ format })).toString('latin1');
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length, `páginas en ${format}`).toBe(1);
  }
  await cardPage.emulateMedia({ media: 'screen' });
  await cardPage.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(cardPage);
  await cardPage.close();

  // --- 3. Ajustes → Implantes: dos pacientes con el mismo lote ---
  await admin.post(`/patients/${other.id}/implants`, {
    toothNumber: '46',
    kind: 'IMPLANT',
    manufacturer: 'Straumann',
    reference: '021.5310',
    lot: LOT,
  });
  await page.goto(`${origin}/settings/implantes`);
  await page.getByRole('textbox', { name: 'Lote', exact: true }).fill(LOT);
  await page.getByRole('main').getByRole('button', { name: 'Buscar', exact: true }).click();
  const lotTable = page.getByRole('table', { name: 'Pacientes que recibieron el lote o la referencia' });
  // Cabecera + los dos pacientes.
  await expect(lotTable.getByRole('row')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByText('2 implantes encontrados')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`implantes-${LOT}.csv`);

  // --- 4. Móvil 390 px ---
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.goto(`${origin}/patients/${patient.id}?tab=implants`);
  await expect(panel.getByRole('list', { name: 'Implantes del diente 36' })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoHorizontalScroll(page);
  await panel.getByRole('button', { name: 'Registrar implante' }).click();
  await expect(dialog).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');
});

/**
 * 5. Desde el ítem ACEPTADO del plan: «Registrar implante en el diente N» abre
 *    el formulario con el diente puesto y el registro queda ligado al ítem
 *    (`treatmentPlanItemId`); un ítem PROPUESTO no ofrece el enlace. La tarjeta
 *    se lee con el tema oscuro (hoja blanca, tinta oscura).
 */
test('registrar desde el ítem del plan aceptado y tarjeta legible en tema oscuro (1440 y 390)', async ({
  page,
}) => {
  const planSuffix = `${suffix}p`;
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = await registerAndLogin(page, {
    subdomain: `test-clinic-implp-${suffix}`.slice(0, 63),
    clinicName: `Clinica Plan Implantes ${suffix}`,
    fullName: 'Dr Plan Implantes',
    email: `test.user.implp.${suffix}@example.com`,
    password,
  });
  const admin = api(page.request, origin, await accessTokenOf(page));
  const patient = await admin.post<{ id: string }>('/patients', {
    firstName: 'Rosa',
    lastName: `Plan${planSuffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `IMP${planSuffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await admin.post<{ id: string }>('/catalog/items', {
    code: `impl-${planSuffix}`.slice(0, 40),
    kind: 'PROCEDURE',
    labelEs: `Implante-${planSuffix}`,
    color: '#3366CC',
    defaultPrice: 1000,
  });
  const plan = await admin.post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const accepted = await admin.post<{ id: string }>(`/treatment-plans/${plan.id}/items`, {
    toothNumber: '36',
    catalogItemId: catalog.id,
  });
  await admin.patch(`/treatment-plans/${plan.id}/items/${accepted.id}`, { status: 'ACCEPTED' });
  await admin.post(`/treatment-plans/${plan.id}/items`, { toothNumber: '46', catalogItemId: catalog.id });

  const plansPanel = page.locator('#tabpanel-treatment-plans');
  const dialog = page.getByRole('dialog', { name: 'Registrar implante' });

  // --- 390 px: el enlace está en la lista móvil y el formulario cabe ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/patients/${patient.id}?tab=treatment-plans`);
  const mobileLink = plansPanel
    .getByRole('link', { name: 'Registrar implante en el diente 36' })
    .filter({ visible: true });
  await expect(mobileLink).toHaveCount(1, { timeout: 15_000 });
  // El ítem PROPUESTO (46) no ofrece el enlace.
  await expect(plansPanel.getByRole('link', { name: 'Registrar implante en el diente 46' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await mobileLink.click();
  await expect(dialog.getByLabel('Diente (FDI)')).toHaveValue('36');
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // --- 1440 px: registrar contra el ítem ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/patients/${patient.id}?tab=treatment-plans`);
  const link = plansPanel
    .getByRole('link', { name: 'Registrar implante en el diente 36' })
    .filter({ visible: true });
  await expect(link).toHaveCount(1, { timeout: 15_000 });
  await link.click();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByLabel('Diente (FDI)')).toHaveValue('36');
  await expect(dialog.getByText('Se registra contra el ítem del plan desde el que lo abriste.')).toBeVisible();
  await dialog.getByLabel('Fabricante').fill('Straumann');
  await dialog.getByLabel('Referencia (REF)').fill('021.5310');
  await dialog.getByLabel('Lote').fill(`${LOT}P`.slice(0, 40));
  await dialog.getByRole('button', { name: 'Registrar implante' }).click();
  await expect(dialog).toBeHidden();
  const panel = page.locator('#tabpanel-implants');
  const tooth36 = panel.getByRole('list', { name: 'Implantes del diente 36' });
  await expect(tooth36).toContainText(`${LOT}P`.slice(0, 40));
  // El acceso directo se limpia de la URL: recargar no reabre el formulario.
  await expect(page).not.toHaveURL(/registerTooth|planItem/);
  const implants = await admin.get<{ treatmentPlanItemId: string | null }[]>(
    `/patients/${patient.id}/implants`,
  );
  expect(implants.map((i) => i.treatmentPlanItemId)).toEqual([accepted.id]);

  // --- La tarjeta con el tema oscuro: hoja blanca y tinta oscura ---
  await page.emulateMedia({ colorScheme: 'dark' });
  const [cardPage] = await Promise.all([
    page.context().waitForEvent('page'),
    tooth36.getByRole('link', { name: /Tarjeta de implante/ }).first().click(),
  ]);
  await cardPage.emulateMedia({ colorScheme: 'dark' });
  await expect(cardPage.locator('html')).toHaveClass(/dark/, { timeout: 15_000 });
  const card = cardPage.getByRole('article');
  await expect(card).toContainText(`Rosa Plan${planSuffix}`.slice(0, 45));
  const inkOnPaper = await card.getByText(`Rosa Plan${planSuffix}`.slice(0, 45)).evaluate((el) => {
    const channels = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const luminance = (c: string) => {
      const [r, g, b] = channels(c).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const paper = getComputedStyle(el.closest('article')!).backgroundColor;
    const ink = getComputedStyle(el).color;
    const [hi, lo] = [luminance(paper), luminance(ink)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
  expect(inkOnPaper, 'contraste de la tinta sobre la hoja de la tarjeta (tema oscuro)').toBeGreaterThanOrEqual(4.5);
  await cardPage.close();
});
