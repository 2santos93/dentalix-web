import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e DX-172 — «¿Cómo nos conoció?», sin mocks, en una clínica nueva (la API
 * siembra su catálogo: «Recomendación de paciente», Instagram…):
 *  1. Recepción (1440 px) da de alta a un paciente con «Recomendación de
 *     paciente» y busca a quien lo recomendó; la ficha dice «Recomendado por»
 *     con enlace, y la del referente «Ha recomendado a 1 paciente».
 *  2. ADMIN, Reportes › Captación a 1440 px: resumen, barra y tabla por
 *     fuente, «Sin dato», el top de referentes enlazado y el CSV; axe en
 *     claro y oscuro.
 *  3. Lo mismo a 390 px: tarjetas apiladas y sin scroll horizontal.
 *  4. ADMIN, Ajustes › Origen de pacientes: añade una fuente y la desactiva.
 *
 * Datos por la API: la referente, dos de Instagram (una con un abono de 40 USD
 * hoy, con la hora actual, nunca «ahora + N») y uno sin fuente.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);
const subdomain = `test-captacion-${suffix}`;
const password = 'Password123!';
const admin = { fullName: 'Dra. Captación Titular', email: `captacion.${suffix}@example.com` };
const reception = { fullName: 'Recepción Captación', email: `captacion.rec.${suffix}@example.com` };
const LAST = `Captacion${suffix}`;
const REFERRER = { firstName: 'Luisa', lastName: `Márquez${suffix}` };
const REFERRER_NAME = `${REFERRER.firstName} ${REFERRER.lastName}`;
const NEW_PATIENT = { firstName: 'Andrés', lastName: `Rojas${suffix}` };
const fmt = regionalFormat(E2E_REGION);
const usd = (amount: number) => moneyWithCode(amount, 'USD', fmt);

test.describe.configure({ mode: 'serial' });

let session: ApiSession;
let referrerId: string;
let sources: { id: string; name: string; systemKey: string | null }[];

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clinica Captacion ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const res = await request.get(`${API_URL}/patient-sources?includeInactive=true`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  sources = (await res.json()) as typeof sources;
  const instagram = sources.find((s) => s.systemKey === 'INSTAGRAM')!.id;

  const patient = (firstName: string, extra: Record<string, unknown> = {}) =>
    apiPost<{ id: string }>(request, session, '/patients', {
      firstName,
      lastName: LAST,
      docType: 'NATIONAL_ID',
      docNumber: `CAP${firstName.slice(0, 3)}${suffix}`.slice(0, 20),
      sex: 'F',
      ...extra,
    });
  referrerId = (
    await apiPost<{ id: string }>(request, session, '/patients', {
      ...REFERRER,
      docType: 'NATIONAL_ID',
      docNumber: `CAPREF${suffix}`.slice(0, 20),
      sex: 'F',
    })
  ).id;
  const paying = await patient('Beatriz', { sourceId: instagram });
  await patient('Carla', { sourceId: instagram });
  await patient('Diana');

  // Un abono de 40 USD de Beatriz, hoy.
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `CAP100-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Limpieza ${suffix}`,
    color: '#3366CC',
    defaultPrice: 100,
  });
  const plan = await apiPost<{ id: string }>(request, session, `/patients/${paying.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  const accept = await request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: session.headers,
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok(), await accept.text()).toBeTruthy();
  await apiPost(request, session, `/treatment-plans/${plan.id}/payments`, {
    amount: 40,
    currency: 'USD',
    paidAt: new Date().toISOString(),
    method: 'TRANSFER',
  });
});

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`dx172-${name}.png`), fullPage: true, animations: 'disabled' });
}

test('1440 px recepción: alta con «¿Cómo nos conoció?» y el paciente que lo recomendó', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, session.origin, reception.email, password);
  await page.goto(`${session.origin}/patients/new`);
  await page.getByLabel('Nombre', { exact: true }).fill(NEW_PATIENT.firstName);
  await page.getByLabel('Apellido', { exact: true }).fill(NEW_PATIENT.lastName);
  await page.getByLabel('Tipo de documento').selectOption('NATIONAL_ID');
  const source = page.getByLabel('¿Cómo nos conoció? (opcional)');
  await expect(source.getByRole('option', { name: 'Recomendación de paciente' })).toBeAttached({ timeout: 30_000 });
  await source.selectOption({ label: 'Recomendación de paciente' });
  await page.getByLabel('Paciente que lo recomendó (opcional)', { exact: true }).fill(REFERRER.lastName);
  await page.getByRole('button', { name: new RegExp(REFERRER_NAME) }).click();
  await expect(page.getByTestId('picked-patient')).toHaveText(REFERRER_NAME);
  await shot(page, 'alta-1440');
  await page.getByRole('button', { name: 'Crear paciente' }).click();

  await expect(page).toHaveURL(/\/patients\/[^/]+$/, { timeout: 30_000 });
  const origin = page.getByRole('region', { name: 'Origen' });
  await expect(origin).toContainText('Recomendación de paciente', { timeout: 30_000 });
  const link = origin.getByRole('link', { name: REFERRER_NAME });
  await expect(link).toHaveAttribute('href', `/patients/${referrerId}`);
  await expectNoHorizontalScroll(page);
  await shot(page, 'ficha-1440');

  await link.click();
  await expect(page).toHaveURL(new RegExp(`/patients/${referrerId}`));
  const referrer = page.getByRole('region', { name: 'Origen' });
  await expect(referrer.getByTestId('patient-referrals-count')).toHaveText('1 paciente', { timeout: 30_000 });
  await expect(referrer.getByRole('link', { name: `${NEW_PATIENT.firstName} ${NEW_PATIENT.lastName}` })).toBeVisible();
});

async function openReport(page: Page): Promise<void> {
  await loginAs(page, session.origin, admin.email, password);
  await page.goto(`${session.origin}/reportes?tab=captacion`);
  await expect(page.getByRole('tab', { name: 'Captación', selected: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('acquisition-new')).toBeVisible({ timeout: 30_000 });
}

test('1440 px ADMIN: Reportes › Captación por fuente, «Sin dato», referentes y CSV; axe claro y oscuro', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page);
  // 5 altas: la referente y Diana sin fuente, 2 de Instagram, 1 recomendada.
  await expect(page.getByTestId('acquisition-new')).toContainText('5');
  await expect(page.getByTestId('acquisition-paying')).toContainText('1');
  await expect(page.getByTestId('acquisition-collected')).toContainText(usd(40));

  const table = page.getByRole('table', { name: 'Captación por fuente' });
  const instagram = table.getByRole('row').filter({ hasText: 'Instagram' });
  await expect(instagram).toContainText('2');
  await expect(instagram).toContainText(usd(40));
  await expect(table.getByRole('row').filter({ hasText: 'Sin dato' })).toContainText('2');
  await expect(table.getByRole('row').filter({ hasText: 'Recomendación de paciente' })).toContainText('1');

  const bars = page.getByRole('figure', { name: 'Pacientes nuevos por fuente' }).getByTestId('ranked-bar');
  await expect(bars.first()).toContainText(/Instagram|Sin dato/);

  const referrers = page.getByRole('table', { name: 'Pacientes que más recomiendan' });
  await expect(referrers.getByRole('link', { name: REFERRER_NAME })).toHaveAttribute('href', `/patients/${referrerId}`);

  await page.getByRole('button', { name: 'Cómo se calcula', exact: true }).click();
  await expect(page.getByTestId('acquisition-how')).toContainText('Sede de captación');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^captacion-de-pacientes-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/,
  );

  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  const found = await axeInBothThemes(page, page.getByRole('main'), (scheme) => shot(page, `informe-1440-${scheme}`));
  expect(found.light, 'axe en claro').toEqual([]);
  expect(found.dark, 'axe en oscuro').toEqual([]);
});

test('390 px ADMIN: la captación en tarjetas apiladas, sin scroll horizontal', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openReport(page);
  const list = page.getByRole('list', { name: 'Captación por fuente' });
  await expect(list).toBeVisible();
  await expect(page.getByRole('table', { name: 'Captación por fuente' })).toHaveCount(0);
  const card = list.getByRole('listitem').filter({ hasText: 'Instagram' });
  await expect(card).toContainText('2 nuevos');
  await expect(card).toContainText(usd(40));
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('dx172-informe-390-tarjetas.png'), animations: 'disabled' });
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  const found = await axeInBothThemes(page, page.getByRole('main'), (scheme) => shot(page, `informe-390-${scheme}`));
  expect(found.light, 'axe en claro').toEqual([]);
  expect(found.dark, 'axe en oscuro').toEqual([]);
});

test('ADMIN: Ajustes › Origen de pacientes añade una fuente y la desactiva', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, session.origin, admin.email, password);
  await page.goto(`${session.origin}/settings/origen-de-pacientes`);
  await expect(page.getByRole('heading', { name: 'Origen de pacientes' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Nueva fuente' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva fuente' });
  await dialog.getByLabel('Nombre').fill(`Valla ${suffix}`);
  await dialog.getByRole('button', { name: 'Añadir fuente' }).click();
  await expect(page.getByText(`Fuente «Valla ${suffix}» añadida.`)).toBeVisible();
  const table = page.getByRole('table', { name: 'Fuentes de «¿Cómo nos conoció?»' });
  await table.getByRole('button', { name: `Acciones de Valla ${suffix}` }).click();
  await page.getByRole('menuitem', { name: /Desactivar/ }).click();
  const confirm = page.getByRole('dialog', { name: `¿Desactivar «Valla ${suffix}»?` });
  await expect(confirm).toContainText('Los pacientes que ya la tienen la conservan');
  await confirm.getByRole('button', { name: 'Desactivar' }).click();
  await expect(table.getByRole('row').filter({ hasText: `Valla ${suffix}` })).toContainText('Desactivada');
  await shot(page, 'ajustes-1440');
});
