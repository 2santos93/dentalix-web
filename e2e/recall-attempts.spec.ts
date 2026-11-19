import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Locator } from '@playwright/test';
import { test, expect, type Page } from './support/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { addDays, sedeDayFromToday } from './support/clock';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-465 · Recall: intentos con desenlace, ocultar N días y tope.
 *
 * Datos por la API (clínica nueva, un control vencido por paciente). Recepción
 * registra «No contesta» y el paciente sale de la lista; «Incluir contactados»
 * lo enseña con «1 de 3». «Número erróneo» marca el teléfono: la ficha dice
 * «Teléfono por revisar» y «Ya está corregido» lo quita (y los intentos vuelven
 * a cero). A 390 px, el lote de
 * dos pacientes desde las casillas y la barra fija. El ADMIN baja el tope de la
 * sede a 1 en Ajustes › Recall (persiste) y el siguiente intento lleva al
 * paciente a «Intentos agotados». axe en claro y oscuro, capturas `qa-shot`.
 *
 * Fechas: «hoy» y lo que queda oculto los cuenta la API con la zona de la sede
 * (`sedeDayFromToday`); el spec no compara días, solo presencia y «N de M».
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `recint-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.rint.${suffix}@example.com` };
const reception = { fullName: 'Rita Mostrador', email: `rita.rint.${suffix}@example.com` };
const lastControl = addDays(sedeDayFromToday(0), -240);
const lastName = `Intentos${suffix}`.slice(0, 30);
const full = (first: string) => `${first} ${lastName}`;

let session: ApiSession;
const patientIds: Record<string, string> = {};

async function seedDuePatient(request: APIRequestContext, firstName: string, doc: string): Promise<string> {
  const { id } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName,
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `${doc}${suffix}`.slice(0, 20),
    sex: 'F',
    phone: '+58 412 555 0188',
  });
  // Control cada 6 meses, el último hace 240 días: vencido y sin cita.
  const res = await request.put(`${API_URL}/patients/${id}/recalls/CHECKUP`, {
    headers: session.headers,
    data: { intervalMonths: 6, lastDoneAt: lastControl, active: true },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return id;
}

function list(page: Page): Locator {
  return dataList(page, 'Pacientes por llamar');
}

function rowOf(page: Page, firstName: string): Locator {
  return dataListRows(list(page)).filter({ hasText: full(firstName) });
}

async function showAttempts(page: Page, value: 'due' | 'contacted' | 'exhausted'): Promise<void> {
  await page.getByLabel('Intentos', { exact: true }).selectOption(value);
}

async function registerFromRow(
  page: Page,
  firstName: string,
  outcome: string,
  width: number,
  shotName?: string,
): Promise<void> {
  await rowAction(page, rowOf(page, firstName), 'Registrar intento');
  const dialog = page.getByRole('dialog', { name: 'Registrar intento' });
  await dialog.getByLabel('Canal', { exact: true }).selectOption('CALL');
  await dialog.getByLabel('Resultado', { exact: true }).selectOption(outcome);
  await expectDialogInsideViewport(page, dialog);
  if (shotName) {
    const found = await axeInBothThemes(page, dialog);
    for (const scheme of ['light', 'dark'] as const) {
      expect(found[scheme], `axe (${scheme}) en «Registrar intento» a ${width} px`).toEqual([]);
    }
    await shot(page, shotName, width);
  }
  await dialog.getByRole('button', { name: 'Guardar intento' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Intento registrado para ${full(firstName)}`)).toBeVisible();
}

async function expectListClean(page: Page, width: number, what: string): Promise<void> {
  const found = await axeInBothThemes(page, page.locator('main'));
  for (const scheme of ['light', 'dark'] as const) {
    expect(found[scheme], `axe (${scheme}) en ${what} a ${width} px`).toEqual([]);
  }
  await expectNoHorizontalScroll(page);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Intentos ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  for (const [name, doc] of [
    ['Alba', 'IA'],
    ['Berta', 'IB'],
    ['Carla', 'IC'],
    ['Dora', 'ID'],
    ['Elsa', 'IE'],
  ] as const) {
    patientIds[name] = await seedDuePatient(request, name, doc);
  }
});

test('recepción, 1440: un intento lo saca de la lista; «Incluir contactados» lo enseña; número erróneo y su corrección', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/recall`);
  await expect(rowOf(page, 'Alba')).toBeVisible();
  await expect(rowOf(page, 'Alba')).toContainText('0 de 3');
  await expectListClean(page, 1440, 'la lista de recall');
  await shot(page, 'recall-attempts-list', 1440);

  // «No contesta»: sale de la lista por defecto.
  await registerFromRow(page, 'Alba', 'NO_ANSWER', 1440, 'recall-attempts-contact');
  await expect(rowOf(page, 'Alba')).toHaveCount(0);

  // «Incluir contactados»: vuelve a verse, con «1 de 3» y su último intento; la URL lo recuerda.
  await showAttempts(page, 'contacted');
  await expect(page).toHaveURL(/\/recall\?intentos=contactados$/);
  await expect(rowOf(page, 'Alba')).toContainText('1 de 3');
  await expect(rowOf(page, 'Alba')).toContainText('No contesta · Llamada');
  await page.reload();
  await expect(page.getByLabel('Intentos', { exact: true })).toHaveValue('contacted');
  await expect(rowOf(page, 'Alba')).toContainText('1 de 3');
  await expectListClean(page, 1440, '«Incluir contactados»');
  await shot(page, 'recall-attempts-contacted', 1440);

  // «Número erróneo»: cuenta como intento y marca el teléfono.
  await registerFromRow(page, 'Elsa', 'WRONG_NUMBER', 1440);
  await expect(rowOf(page, 'Elsa')).toContainText('Teléfono por revisar');

  await page.goto(`${origin}/patients/${patientIds.Elsa}?tab=data`);
  const notice = page.getByTestId('phone-review');
  await expect(notice).toContainText('Teléfono por revisar');
  await expect(page.getByTestId('recall-cycle')).toContainText('Intentos: 1 de 3');
  await expect(page.getByTestId('recall-contact-row').first()).toContainText('Control · Llamada · Número erróneo');
  const found = await axeInBothThemes(page, page.getByTestId('patient-recall'));
  for (const scheme of ['light', 'dark'] as const) {
    expect(found[scheme], `axe (${scheme}) en el recall de la ficha a 1440 px`).toEqual([]);
  }
  await shot(page, 'recall-attempts-record', 1440);
  await notice.getByRole('button', { name: 'Ya está corregido' }).click();
  await expect(page.getByText('Teléfono marcado como corregido.')).toBeVisible();
  await expect(notice).toBeHidden();
  // Corregir el teléfono vuelve a contar los intentos desde cero.
  await page.reload();
  await expect(page.getByTestId('recall-row-CHECKUP')).toBeVisible();
  await expect(page.getByTestId('phone-review')).toHaveCount(0);
  await expect(page.getByTestId('patient-recall')).not.toContainText('Intentos: 1 de 3');
});

test('recepción, 390: lote de 2 pacientes desde las casillas, con la barra fija', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/recall`);
  await expect(rowOf(page, 'Berta')).toBeVisible();

  await page.getByRole('checkbox', { name: `Seleccionar a ${full('Berta')}`, exact: true }).check();
  await page.getByRole('checkbox', { name: `Seleccionar a ${full('Carla')}`, exact: true }).check();
  const bar = page.getByRole('region', { name: 'Pacientes seleccionados' });
  await expect(bar).toContainText('2 seleccionados');
  await expect(bar).toBeInViewport();
  await expectListClean(page, 390, 'la lista con selección');
  await shot(page, 'recall-attempts-selection', 390);

  await bar.getByRole('button', { name: 'Registrar intento (2)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar intento de 2 pacientes' });
  await expect(dialog).toContainText(full('Berta'));
  await expect(dialog).toContainText(full('Carla'));
  await dialog.getByLabel('Canal', { exact: true }).selectOption('WHATSAPP_LINK');
  await dialog.getByLabel('Resultado', { exact: true }).selectOption('LEFT_MESSAGE');
  await dialog.getByLabel('Nota (opcional)', { exact: true }).fill('Mensaje de control enviado');
  await expectDialogInsideViewport(page, dialog);
  const found = await axeInBothThemes(page, dialog);
  for (const scheme of ['light', 'dark'] as const) {
    expect(found[scheme], `axe (${scheme}) en el lote a 390 px`).toEqual([]);
  }
  await shot(page, 'recall-attempts-batch', 390);
  await dialog.getByRole('button', { name: 'Guardar 2 intentos' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Intento registrado para 2 pacientes.')).toBeVisible();
  await expect(rowOf(page, 'Berta')).toHaveCount(0);
  await expect(rowOf(page, 'Carla')).toHaveCount(0);
  await expect(bar).toBeHidden();

  await showAttempts(page, 'contacted');
  await expect(rowOf(page, 'Berta')).toContainText('1 de 3');
  await expect(rowOf(page, 'Carla')).toContainText('1 de 3');
  await expectNoHorizontalScroll(page);
});

test('ADMIN: tope de la sede a 1 en Ajustes › Recall (persiste) y el siguiente intento lo deja en «Intentos agotados»', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/recall`);
  const table = dataList(page, 'Intentos de llamada por sede');
  await expect(table).toContainText('7 días');
  await expect(table).toContainText('Por defecto');
  await page.getByRole('button', { name: /^Configurar los intentos de / }).click();
  const dialog = page.getByRole('dialog', { name: /^Intentos de llamada en / });
  await dialog.getByLabel('Ocultar tras un intento (días)', { exact: true }).fill('5');
  await dialog.getByLabel('Tope de intentos', { exact: true }).fill('11');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog.getByText('El tope de intentos va de 1 a 10.')).toBeVisible();
  await dialog.getByLabel('Tope de intentos', { exact: true }).fill('1');
  const dialogAxe = await axeInBothThemes(page, dialog);
  for (const scheme of ['light', 'dark'] as const) {
    expect(dialogAxe[scheme], `axe (${scheme}) en el modal de intentos a 1440 px`).toEqual([]);
  }
  await shot(page, 'recall-attempts-settings-modal', 1440);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(table).toContainText('5 días');
  await expect(table).toContainText('1 intento');
  await expect(table).not.toContainText('Por defecto');
  await expectListClean(page, 1440, 'Ajustes › Recall');
  await shot(page, 'recall-attempts-settings', 1440);

  // A 390: el siguiente intento de Dora agota el tope.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/recall`);
  await expect(rowOf(page, 'Dora')).toBeVisible();
  await registerFromRow(page, 'Dora', 'LEFT_MESSAGE', 390, 'recall-attempts-contact');
  await expect(rowOf(page, 'Dora')).toHaveCount(0);
  await showAttempts(page, 'exhausted');
  await expect(rowOf(page, 'Dora')).toContainText('1 de 1');
  await expectListClean(page, 390, '«Intentos agotados»');
  await shot(page, 'recall-attempts-exhausted', 390);
  // Agotados no salen tampoco con «Incluir contactados»: es otro filtro.
  await showAttempts(page, 'contacted');
  await expect(rowOf(page, 'Dora')).toHaveCount(0);
});
