import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { formatCurrency } from '../src/lib/format/currency';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-105: listas de precios y convenios.
 *
 * ADMIN crea (por la UI) la lista «Tarifa» en COP y le pone precio a un
 * procedimiento («Editar precio»), y el convenio «Sura −20 %» (el pagador se
 * crea por la API, con la cobertura del paciente: SEC-047). RECEPCIÓN asigna
 * el convenio en la ficha —el diálogo elige la cobertura vigente— y ve el chip
 * «Convenio: Sura −20 %». El DENTISTA abre la pestaña Plan, crea un plan en
 * COP, elige el procedimiento y el precio llega precargado con el −20 % y la
 * línea de origen «Convenio · Sura −20 %»; la fila del plan y el presupuesto
 * imprimible dicen «Convenio» y «Ahorro por convenio». Todo a 390 px sin
 * scroll horizontal y con los diálogos dentro de la pantalla.
 *
 * Con `DX105_QA_SHOTS=1` además deja capturas de QA en `DX105_QA_DIR`
 * (la CI no lo define y no escribe nada).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `convenios-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.conv.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.conv.${suffix}@example.com` };
const dentist = { fullName: 'Daniel Odontólogo', email: `dani.conv.${suffix}@example.com` };
const lastName = `Convenio${suffix}`.slice(0, 40);
const payerName = 'Sura EPS';
const listName = 'Tarifa';
const agreementName = 'Sura −20 %';
const procedureLabel = `Corona DX105 ${suffix}`.slice(0, 40);
const CATALOG_PRICE = 150_000;
const LIST_PRICE = 140_000;
const PERCENT = 20;
const AGREEMENT_PRICE = CATALOG_PRICE * (1 - PERCENT / 100);
const SAVING = CATALOG_PRICE - AGREEMENT_PRICE;
const money = (amount: number): string => formatCurrency(amount, 'COP');
// Solo la cifra («120.000,00»): entre ella y «COP» va un espacio duro.
const figure = (amount: number): string => money(amount).split(/\s/)[0];

const QA_DIR = path.resolve(process.env.DX105_QA_DIR ?? 'e2e/.qa-shots');
const QA = process.env.DX105_QA_SHOTS === '1';

/** Captura de QA estable: sin animaciones, con fuentes y la red en reposo. */
async function shot(page: Page, name: string, fullPage = false) {
  if (!QA) return;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(QA_DIR, `${name}.png`), fullPage, animations: 'disabled' });
}

let session: ApiSession;
let patientId = '';
let priceListId = '';
let payerId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Convenios ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  const payer = await apiPost<{ id: string }>(request, session, '/payers', {
    name: payerName,
    type: 'PUBLIC_SYSTEM',
  });
  payerId = payer.id;
  await apiPost(request, session, '/catalog/items', {
    code: `dx105-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: procedureLabel,
    color: '#3366CC',
    defaultPrice: CATALOG_PRICE,
  });
  ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Camila',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `CV${suffix}`.slice(0, 20),
    sex: 'F',
  }));
  // SEC-047: el convenio de un pagador exige una cobertura vigente del
  // paciente con ese pagador; el diálogo la elige sola si es la única.
  // SEC-049: con el nº de afiliado (obligatorio con un pagador externo); la
  // registra el ADMIN, así que recepción puede asignar el convenio con ella.
  await apiPost(request, session, `/patients/${patientId}/coverages`, {
    payerId: payer.id,
    planName: 'Plan Sura',
    memberNumber: '1020304050',
  });
});

test('ADMIN crea la lista «Tarifa» en COP y le pone precio a un procedimiento; a 390 px sin scroll horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/listas-de-precios`);

  await page.getByRole('button', { name: 'Nueva lista' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nueva lista de precios' });
  await dialog.getByLabel('Nombre').fill(listName);
  await dialog.getByLabel('Moneda').selectOption('COP');
  await dialog.getByRole('button', { name: 'Crear lista' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const table = page.getByRole('table', { name: 'Listas de precios' });
  const row = table.getByRole('row', { name: new RegExp(listName) });
  await expect(row).toContainText('COP');
  await expect(row).toContainText('Toda la clínica');
  await expect(row).toContainText('0');
  await expect(row.getByText('Activa', { exact: true })).toBeVisible();
  await shot(page, 'ajustes-listas-1440');

  const lists = await page.request.get(`${API_URL}/price-lists`, { headers: session.headers });
  priceListId = ((await lists.json()) as { id: string; name: string }[]).find((l) => l.name === listName)!.id;

  // Precios de la lista: «Editar precio» del procedimiento.
  await row.getByRole('link', { name: `Precios «${listName}»` }).click();
  await expect(page).toHaveURL(new RegExp(`/settings/listas-de-precios/${priceListId}$`));
  await page.getByLabel('Buscar por código, nombre o categoría').fill(procedureLabel);
  const itemRow = page.getByRole('row').filter({ hasText: procedureLabel });
  await expect(itemRow).toBeVisible({ timeout: 10_000 });
  await expect(itemRow).toContainText('Sin precio');
  await expect(itemRow).toContainText(figure(CATALOG_PRICE));

  await itemRow.getByRole('button', { name: `Editar precio de «${procedureLabel}»` }).click();
  const priceDialog = page.getByRole('dialog', { name: 'Editar precio' });
  await expect(priceDialog).toContainText(`Precio de catálogo: ${money(CATALOG_PRICE)}`);
  await priceDialog.getByLabel('Precio de lista').fill(String(LIST_PRICE));
  await priceDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(priceDialog).toBeHidden({ timeout: 10_000 });
  await expect(itemRow).toContainText(figure(LIST_PRICE));
  await expect(itemRow).not.toContainText('Sin precio');
  await shot(page, 'ajustes-lista-items-1440');

  // Persistido en la API. El listado va paginado (20 por página, ~80 del
  // catálogo base): se busca la prestación del test en vez de mirar solo la
  // página 1, y se compara su precio, no cualquier número del cuerpo.
  const items = await page.request.get(`${API_URL}/price-lists/${priceListId}/items`, {
    headers: session.headers,
    params: { query: procedureLabel },
  });
  expect(items.ok()).toBeTruthy();
  const listed = ((await items.json()) as { items: { labelEs: string; price: number | string | null }[] }).items;
  const priced = listed.filter((item) => item.labelEs === procedureLabel);
  expect(priced).toHaveLength(1);
  expect(Number(priced[0].price)).toBe(LIST_PRICE);

  // 390 px: las dos pantallas y el diálogo caben.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(procedureLabel).locator('visible=true').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: `Editar precio de «${procedureLabel}»` }).locator('visible=true').first().click();
  const modal390 = page.getByRole('dialog', { name: 'Editar precio' });
  await expectDialogInsideViewport(page, modal390);
  await expectNoHorizontalScroll(page);
  await modal390.getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal390).toBeHidden();

  await page.goto(`${origin}/settings/listas-de-precios`);
  await expect(page.getByText(listName).locator('visible=true').first()).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalScroll(page);
});

test('ADMIN crea el convenio «Sura −20 %» y lo ve activo; a 390 px sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/convenios`);

  await page.getByRole('button', { name: 'Nuevo convenio' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo convenio' });
  await dialog.getByLabel('Nombre').fill(agreementName);
  await dialog.getByLabel('Pagador').selectOption({ label: payerName });
  await dialog.getByLabel('Tipo').selectOption('PERCENT_DISCOUNT');
  await dialog.getByLabel('Descuento general (%)').fill(String(PERCENT));
  await dialog.getByRole('button', { name: 'Crear convenio' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const table = page.getByRole('table', { name: 'Convenios' });
  const row = table.getByRole('row', { name: new RegExp(agreementName) });
  await expect(row).toContainText(payerName);
  await expect(row).toContainText('Descuento porcentual');
  await expect(row).toContainText('20 %');
  await expect(row).toContainText('Toda la clínica');
  await expect(row).toContainText('Sin límite');
  await expect(row.getByText('Activo', { exact: true })).toBeVisible();
  await shot(page, 'ajustes-convenios-1440');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(agreementName).locator('visible=true').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'ajustes-convenios-390');

  await page.getByRole('button', { name: 'Nuevo convenio' }).first().click();
  const modal390 = page.getByRole('dialog', { name: 'Nuevo convenio' });
  await expectDialogInsideViewport(page, modal390);
  await expectNoHorizontalScroll(page);
  await modal390.getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal390).toBeHidden();
});

test('RECEPCIÓN asigna el convenio en la ficha: sección y chip «Convenio: Sura −20 %»; a 390 px cabe', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);

  const section = page.getByTestId('patient-agreement');
  await expect(section.getByText('Sin convenio asignado')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('agreement-chip')).toHaveCount(0);

  await section.getByRole('button', { name: 'Asignar convenio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Asignar convenio' });
  await dialog.getByLabel('Convenio', { exact: true }).selectOption({ label: `${agreementName} · ${payerName}` });
  await expect(dialog.getByLabel('Cobertura del pagador')).toHaveValue(/.+/);
  await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const current = section.getByTestId('agreement-current');
  await expect(current).toContainText(agreementName);
  await expect(current).toContainText(payerName);
  await expect(current).toContainText('Descuento porcentual');
  await expect(current).toContainText('Vigente');
  const chip = page.getByTestId('agreement-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveText(`Convenio: ${agreementName}`);
  await expectNoHorizontalScroll(page);
  await section.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'ficha-convenio-1440');

  // 390 px: la ficha con convenio y el diálogo de cambio caben.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chip).toBeVisible();
  await expectNoHorizontalScroll(page);
  await section.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'ficha-convenio-390');
  await current.getByRole('button', { name: `Cambiar el convenio ${agreementName}` }).click();
  const change = page.getByRole('dialog', { name: 'Cambiar convenio' });
  await expectDialogInsideViewport(page, change);
  await expectNoHorizontalScroll(page);
  await change.getByRole('button', { name: 'Cancelar' }).click();
  await expect(change).toBeHidden();
});

test('el DENTISTA abre el plan: el precio llega precargado con el convenio, la fila lo dice y el presupuesto muestra el ahorro', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await context.addInitScript(() => {
    window.print = () => undefined;
  });
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);

  const panel = page.locator('#tabpanel-treatment-plans');
  await expect(panel.getByText('Este paciente todavía no tiene un plan de tratamiento.')).toBeVisible({
    timeout: 15_000,
  });
  await panel.getByLabel('Moneda del nuevo plan').selectOption('COP');
  await panel.getByRole('button', { name: 'Nuevo plan' }).click();
  await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 10_000 });

  const form = panel.getByRole('form', { name: 'Agregar ítem' });
  await expect(form).toBeVisible({ timeout: 10_000 });
  await form.getByRole('textbox', { name: 'Código FDI' }).fill('21');
  await expect(form.getByText('Diente 21 seleccionado.')).toBeVisible();
  const group = form.getByRole('group', { name: 'Procedimiento' });
  await group.getByRole('searchbox', { name: 'Buscar en el catálogo' }).fill(procedureLabel);
  await group.getByRole('radio', { name: procedureLabel }).check();

  // Precio precargado por el convenio (−20 % sobre el catálogo) y su origen.
  const price = form.getByRole('textbox', { name: 'Precio' });
  await expect(price).toHaveValue(String(AGREEMENT_PRICE), { timeout: 10_000 });
  const source = form.getByText(/^Convenio · /);
  await expect(source).toContainText(agreementName);
  await expect(source).toContainText(`precio de lista ${money(CATALOG_PRICE)}`);
  await expectNoHorizontalScroll(page);
  await price.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'plan-precio-convenio-1440');

  await form.getByRole('button', { name: 'Agregar ítem' }).click();
  const itemRow = panel.locator('table tbody tr').filter({ has: page.getByRole('cell', { name: '21', exact: true }) });
  await expect(itemRow).toBeVisible({ timeout: 10_000 });
  await expect(itemRow).toContainText(procedureLabel);
  await expect(itemRow).toContainText(money(AGREEMENT_PRICE));
  await expect(itemRow).toContainText(`Convenio ${agreementName}`);
  await expect(itemRow).toContainText(`precio de lista ${money(CATALOG_PRICE)}`);

  // Presupuesto imprimible: «Convenio» y «Ahorro por convenio».
  const [printPage] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('link', { name: /Imprimir presupuesto/ }).click(),
  ]);
  await printPage.setViewportSize({ width: 1440, height: 900 });
  await expect(printPage.getByTestId('quote-header')).toBeVisible({ timeout: 15_000 });
  const agreementBlock = printPage.getByTestId('quote-agreement');
  await expect(agreementBlock).toContainText('Convenio');
  await expect(agreementBlock).toContainText(`${agreementName} · ${payerName}`);
  const saving = printPage.getByTestId('quote-saving-COP');
  await expect(saving).toContainText('Ahorro por convenio');
  await expect(saving).toContainText(figure(SAVING));
  await expect(printPage.getByTestId('quote-total-COP')).toContainText(figure(AGREEMENT_PRICE));
  const quoteRow = printPage.getByRole('row').filter({ hasText: procedureLabel }).locator('visible=true').first();
  await expect(quoteRow).toContainText(figure(AGREEMENT_PRICE));
  await expectNoHorizontalScroll(printPage);
  await shot(printPage, 'presupuesto-convenio-1440', true);
  await printPage.close();

  // 390 px: la pestaña Plan con el ítem no se desplaza.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(itemRow.or(panel.getByText(procedureLabel).locator('visible=true').first())).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('SEC-049: la cobertura que registra RECEPCIÓN no habilita su convenio hasta que el ADMIN la verifica', async ({
  page,
  request,
}) => {
  const { id: secondPatient } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Bruno',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `CVB${suffix}`.slice(0, 20),
    sex: 'M',
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${secondPatient}`);

  // Recepción registra la cobertura del pagador con su nº de afiliado…
  const coverages = page.getByTestId('patient-coverage');
  await coverages.getByRole('button', { name: 'Añadir cobertura' }).click({ timeout: 15_000 });
  const add = page.getByRole('dialog', { name: 'Añadir cobertura' });
  await add.getByLabel('Pagador').selectOption(payerId);
  await add.getByLabel('Nº de afiliado o póliza').fill('5544332211');
  await add.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(add).toBeHidden({ timeout: 10_000 });
  await expect(coverages.getByTestId('coverage-verification')).toHaveText('Sin verificar');

  // …y no puede asignar el convenio con ella: el diálogo dice qué falta.
  const section = page.getByTestId('patient-agreement');
  await section.getByRole('button', { name: 'Asignar convenio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Asignar convenio' });
  await dialog.getByLabel('Convenio', { exact: true }).selectOption({ label: `${agreementName} · ${payerName}` });
  await expect(dialog.getByRole('alert')).toContainText(
    `La cobertura de «${payerName}» la registraste tú y aún no la ha verificado un administrador`,
  );
  await expect(dialog.getByRole('button', { name: 'Asignar', exact: true })).toBeDisabled();
  await shot(page, 'convenio-cobertura-sin-verificar-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();

  // El ADMIN la verifica (por la API; la pantalla está en coverages.spec.ts).
  const list = await request.get(`${API_URL}/patients/${secondPatient}/coverages`, {
    headers: session.headers,
  });
  const [coverage] = (await list.json()) as { id: string }[];
  await apiPost(request, session, `/patients/${secondPatient}/coverages/${coverage.id}/verification`, {
    checkedMemberNumber: '5544332211',
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(coverages.getByTestId('coverage-verification')).toHaveText('Verificada', {
    timeout: 15_000,
  });
  await section.getByRole('button', { name: 'Asignar convenio' }).click();
  await dialog.getByLabel('Convenio', { exact: true }).selectOption({ label: `${agreementName} · ${payerName}` });
  await expect(dialog.getByLabel('Cobertura del pagador')).toHaveValue(coverage.id);
  await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('agreement-chip')).toContainText(`Convenio: ${agreementName}`);
});
