import { test, expect, type Locator, type Page } from './support/test';
import { fillDate } from './support/dates';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { lastSlotToday, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-153: catálogo de pagadores (Ajustes) y cobertura del paciente.
 *
 * ADMIN crea «Sura EPS» (sistema público de salud) y un pagador de cada tipo,
 * sin que ninguno pida país (DX-326); RECEPCIÓN añade una cobertura vencida desde la ficha
 * (fila «Vencida» + chip «Cobertura vencida» en la cabecera), la pone vigente
 * y el chip desaparece; vencida otra vez por la API, el chip sale en la
 * tarjeta de la agenda; el listado de pacientes se filtra por pagador. Todo a
 * 390 px sin scroll horizontal y con el diálogo dentro de la pantalla.
 *
 * Una cobertura de un pagador «Otro / interno» no pide nº de afiliado ni lleva
 * insignia de verificación.
 *
 * Capturas a 1440 y 390 px, claro y oscuro, en E2E_QA_DIR si está definido
 * (la CI no lo define y no escribe nada).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `coberturas-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.cob.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.cob.${suffix}@example.com` };
const lastName = `Cobertura${suffix}`.slice(0, 40);
const otherLastName = `SinPlan${suffix}`.slice(0, 40);
const payerName = 'Sura EPS';
const payerOption = `${payerName} · Sistema público de salud`;
const twoDaysAgo = sedeDayFromToday(-2);
const tomorrow = sedeDayFromToday(1);

const QA_DIR = process.env.E2E_QA_DIR;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/**
 * La captura `${name}-${width}-${scheme}.png` a 1440 y 390 px, en claro y
 * oscuro, sin scroll horizontal; deja la página a 1440. `target` se desplaza a
 * la vista en cada ancho.
 */
async function shot(page: Page, name: string, target?: Locator): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await target?.evaluate((el) => el.scrollIntoView({ block: 'start' }));
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

let session: ApiSession;
let patientId = '';
let coverageId = '';
let payerId = '';
let otherPatientId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Coberturas ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  ({ id: patientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Camila',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `CB${suffix}`.slice(0, 20),
    sex: 'F',
  }));
  ({ id: otherPatientId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Bruno',
    lastName: otherLastName,
    docType: 'NATIONAL_ID',
    docNumber: `CBO${suffix}`.slice(0, 20),
    sex: 'M',
  }));
});

function coverageSection(page: Page) {
  return page.getByTestId('patient-coverage');
}

test('ADMIN crea «Sura EPS» en Ajustes y la ve activa; a 390 px sin scroll horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/pagadores`);

  await page.getByRole('button', { name: 'Nuevo pagador' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo pagador' });
  await dialog.getByLabel('Nombre').fill(payerName);
  await dialog.getByLabel('Tipo').selectOption('PUBLIC_SYSTEM');
  await expect(dialog.getByLabel('País')).toHaveCount(0);
  await shot(page, 'payer-form');
  await dialog.getByRole('button', { name: 'Crear pagador' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const table = page.getByRole('table', { name: 'Pagadores' });
  const row = table.getByRole('row', { name: new RegExp(payerName) });
  await expect(row).toContainText('Sistema público de salud');
  // Activo: sin marca (solo los inactivos la llevan).
  await expect(row).not.toContainText('Inactivo');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(payerName).locator('visible=true').first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Nuevo pagador' }).first().click();
  const modal390 = page.getByRole('dialog', { name: 'Nuevo pagador' });
  await expectDialogInsideViewport(page, modal390);
  await expectNoHorizontalScroll(page);
  await modal390.getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal390).toBeHidden();

  const list = await page.request.get(`${API_URL}/payers`, { headers: session.headers });
  const payers = (await list.json()) as { id: string; name: string }[];
  payerId = payers.find((p) => p.name === payerName)!.id;
});

test('an admin creates one payer of each type and none asks for a country', async ({ page }) => {
  const created = [
    { name: 'Aseguradora Horizonte', type: 'INSURER', label: 'Aseguradora' },
    { name: 'Plan Bienestar', type: 'PREPAID_PLAN', label: 'Plan prepago' },
    { name: 'Servicio Público Regional', type: 'PUBLIC_SYSTEM', label: 'Sistema público de salud' },
    { name: 'Industrias Delta', type: 'EMPLOYER', label: 'Empresa' },
    { name: 'Cortesía del equipo', type: 'OTHER', label: 'Otro / interno (cortesía, empleados)' },
  ] as const;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/pagadores`);
  const table = page.getByRole('table', { name: 'Pagadores' });
  await expect(table.getByRole('row', { name: new RegExp(payerName) })).toBeVisible({ timeout: 15_000 });

  for (const payer of created) {
    await page.getByRole('button', { name: 'Nuevo pagador' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo pagador' });
    await expect(dialog.getByLabel('Tipo').locator('option:not([disabled])')).toHaveText(
      created.map((p) => p.label),
    );
    await expect(dialog.getByLabel('País')).toHaveCount(0);
    await dialog.getByLabel('Nombre').fill(payer.name);
    await dialog.getByLabel('Tipo').selectOption(payer.type);
    if (payer.type === 'OTHER') {
      await expect(dialog).toContainText('solo un administrador podrá asignarlos');
    }
    await dialog.getByRole('button', { name: 'Crear pagador' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    const row = table.getByRole('row', { name: new RegExp(payer.name) });
    await expect(row.getByRole('cell').nth(1)).toHaveText(payer.label);
    await expect(row).not.toContainText('Inactivo');
  }
  await expect(table.getByRole('columnheader', { name: 'País' })).toHaveCount(0);
  await shot(page, 'payers-list');

  const list = await page.request.get(`${API_URL}/payers`, { headers: session.headers });
  const payers = (await list.json()) as Record<string, unknown>[];
  for (const payer of payers) expect(payer).not.toHaveProperty('country');
});

test('RECEPCIÓN añade una cobertura vencida: fila «Vencida» y chip en la cabecera; al ponerla vigente el chip desaparece', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);

  const section = coverageSection(page);
  await expect(section.getByText('Sin cobertura registrada')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('coverage-chip')).toHaveCount(0);

  await section.getByRole('button', { name: 'Añadir cobertura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir cobertura' });
  await dialog.getByLabel('Pagador').selectOption({ label: payerOption });
  await dialog.getByLabel('Plan').fill('Plan Complementario');
  await dialog.getByLabel('Nº de afiliado o póliza').fill('987654');
  await fillDate(dialog, 'Vigente hasta', twoDaysAgo);
  await shot(page, 'coverage-dialog');
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const row = section.getByTestId('coverage-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(payerName);
  await expect(row).toContainText('Plan Complementario');
  await expect(row).toContainText('Afiliado n.º 987654');
  await expect(row.getByText('Vencida', { exact: true })).toBeVisible();
  await expect(row.getByText('Principal', { exact: true })).toBeVisible();
  const chip = page.getByTestId('coverage-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText('Cobertura vencida');
  await expectNoHorizontalScroll(page);
  await shot(page, 'coverage-section', section);

  // Edita «Vigente hasta» a mañana: la cobertura vuelve a estar vigente.
  // «Editar» y «Quitar» viven en el menú «⋯» de la fila (UX v2 · K3).
  await row.getByRole('button', { name: `Acciones de la cobertura de ${payerName}` }).click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar cobertura' });
  await fillDate(edit, 'Vigente hasta', tomorrow);
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(edit).toBeHidden({ timeout: 10_000 });

  await expect(section.getByTestId('coverage-row').getByText('Vencida', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('coverage-chip')).toHaveCount(0);

  const covers = await page.request.get(`${API_URL}/patients/${patientId}/coverages`, {
    headers: session.headers,
  });
  coverageId = ((await covers.json()) as { id: string }[])[0].id;
});

test('390 px: la ficha con cobertura no se desplaza y el diálogo cabe en la pantalla', async ({
  page,
  request,
}) => {
  // Vencida otra vez por la API (el estado se calcula con el día civil de la sede).
  const patched = await request.patch(`${API_URL}/patients/${patientId}/coverages/${coverageId}`, {
    headers: session.headers,
    data: { validTo: twoDaysAgo },
  });
  expect(patched.ok(), await patched.text()).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);

  const section = coverageSection(page);
  await expect(section.getByText('Vencida', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('coverage-chip')).toContainText('Cobertura vencida');
  await expectNoHorizontalScroll(page);

  await section.getByRole('button', { name: 'Añadir cobertura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir cobertura' });
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});

test('SEC-049: recepción ve «Sin verificar», no puede verificar y sin nº no añade la cobertura de un pagador externo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}`);
  const section = coverageSection(page);
  const row = section.getByTestId('coverage-row');
  await expect(row.getByTestId('coverage-verification')).toHaveText('Sin verificar', {
    timeout: 15_000,
  });
  // Recepción no verifica.
  await expect(section.getByRole('button', { name: /^Verificar/ })).toHaveCount(0);

  // Sin nº de afiliado, el formulario no deja añadir otra cobertura del pagador.
  await section.getByRole('button', { name: 'Añadir cobertura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir cobertura' });
  await dialog.getByLabel('Pagador').selectOption({ label: payerOption });
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(
    dialog.getByText('El nº de afiliado o póliza es obligatorio con un pagador externo.'),
  ).toBeVisible();
  await expect(dialog.getByLabel('Nº de afiliado o póliza')).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});

test('SEC-049: el ADMIN verifica la cobertura y queda «Verificada» con quién y cuándo, a 1440 y 390 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients/${patientId}`);
  const section = coverageSection(page);
  const row = section.getByTestId('coverage-row');
  await section
    .getByRole('button', { name: `Verificar la cobertura de ${payerName}` })
    .click({ timeout: 15_000 });
  const confirm = page.getByRole('dialog', { name: 'Verificar cobertura' });
  await expect(confirm).toContainText('el nº de afiliado 987654 es de este paciente');
  await confirm.getByRole('button', { name: 'Verificar', exact: true }).click();
  await expect(confirm).toBeHidden({ timeout: 10_000 });
  await expect(row.getByTestId('coverage-verification')).toHaveText('Verificada');
  await expect(row).toContainText(`Verificada por ${admin.fullName} el `);
  await expect(section.getByRole('button', { name: /^Verificar/ })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row.getByTestId('coverage-verification')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('una cita corta de hoy con cobertura vencida muestra la marca en la agenda y en el detalle', async ({ page, request }) => {
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const providerId = members.find((m) => m.fullName === admin.fullName)!.userId;
  // DX-252: la última franja de hoy en la sede (23:55–23:59), no las 22:00 (en
  // el pasado si la suite corre de noche). La marca va en la fila de la hora.
  const slot = lastSlotToday();
  await apiPost(request, session, '/appointments', {
    patientId,
    providerId,
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await fillDate(page, 'Fecha', slot.day);

  const card = page.getByTestId('day-column-appointment').filter({ hasText: `Camila ${lastName}` });
  await expect(card).toBeVisible({ timeout: 15_000 });
  // Cita de 30 min: la tarjeta recorta el chip, así que el aviso es la marca de la fila de la hora.
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('[title="Cobertura vencida"]')).toBeVisible();

  // El nombre accesible anuncia el aviso y nunca lleva el número de afiliado.
  const cardButton = card.getByRole('button').first();
  await expect(cardButton).toHaveAttribute('aria-label', /Cobertura vencida/);
  await expect(cardButton).not.toHaveAttribute('aria-label', /987654/);

  await cardButton.click();
  const detailLine = page.getByTestId('coverage-detail-line');
  await expect(detailLine).toBeVisible();
  await expect(detailLine).toContainText(`Cobertura: ${payerName}`);
  await expect(detailLine).toContainText('venció el');
  await expect(detailLine).not.toContainText('987654');
  await page.keyboard.press('Escape');

  // 390 px: la agenda no se desplaza y el aviso sigue a la vista.
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await expect(page.getByText('Cobertura vencida').or(page.locator('[title="Cobertura vencida"]')).locator('visible=true').first()).toBeVisible();
});

test('el listado de pacientes filtrado por «Sura EPS» muestra solo a ese paciente', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients`);

  await expect(page.getByText(otherLastName).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(lastName).first()).toBeVisible();

  const select = page.getByRole('combobox', { name: 'Cobertura' });
  await expect(select.locator('option', { hasText: payerName })).toHaveCount(1);
  // Espera la respuesta filtrada: durante la carga la tabla son esqueletos y
  // un «no está» pasaría aunque el filtro no se enviara.
  const filtered = page.waitForResponse(
    (r) => r.url().includes(`payerId=${payerId}`) && r.request().method() === 'GET' && r.ok(),
  );
  await select.selectOption(payerId);
  await filtered;
  await expect(page.getByText('1 paciente', { exact: true })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText(otherLastName)).toHaveCount(0);
  await expect(page.getByText(lastName).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
});

test('an OTHER payer coverage needs no member number and shows no verification badge', async ({
  page,
}) => {
  const otherPayer = 'Cortesía empleados';
  await apiPost(page.request, session, '/payers', { name: otherPayer, type: 'OTHER' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients/${otherPatientId}`);

  const section = coverageSection(page);
  await expect(section.getByText('Sin cobertura registrada')).toBeVisible({ timeout: 15_000 });
  await section.getByRole('button', { name: 'Añadir cobertura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir cobertura' });
  await dialog
    .getByLabel('Pagador')
    .selectOption({ label: `${otherPayer} · Otro / interno (cortesía, empleados)` });
  await expect(dialog.getByLabel('Número de afiliado')).toBeVisible();
  await expect(dialog.getByLabel('Número de afiliado')).not.toHaveAttribute('aria-required', 'true');
  await expect(dialog.getByLabel('Nº de afiliado o póliza')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const row = section.getByTestId('coverage-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(otherPayer);
  await expect(row).toContainText('Otro / interno (cortesía, empleados)');
  await expect(row).not.toContainText('Afiliado n.º');
  await expect(row.getByTestId('coverage-verification')).toHaveCount(0);
  // Ni siquiera el ADMIN tiene nada que verificar.
  await expect(section.getByRole('button', { name: /^Verificar/ })).toHaveCount(0);
});
