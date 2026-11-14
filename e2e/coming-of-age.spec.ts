import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { SEDE_TODAY_TZ, sedeDate } from './support/clock';
import { dataList, dataListRows, rowAction } from './support/data-list';
import { backdateResponsibleParty, E2E_DATABASE_URL } from './support/db';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { E2E_TODAY_REGION } from './support/regional';
import { expectTouchTarget } from './support/touch-targets';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-342: paso a la mayoría de edad.
 *
 * Lucía cumple hoy (día de la sede) los 18 años y tiene a su madre como
 * responsable desde que era menor (el alta se fecha por la BD: la API no deja
 * fecharla). Hasta que recepción lo revisa, sus avisos no van a la madre:
 * - DENTIST ve el aviso en la ficha, sin la acción.
 * - RECEPTION entra por Pacientes → «Mayoría de edad», la ve «Pendiente»,
 *   la revisa con «El paciente gestiona sus avisos» y el aviso de la ficha
 *   desaparece.
 * - A 390 px la lista y el modal no desbordan y la acción mide 44 px.
 *
 * Diego tiene 30 años y un responsable dado de alta ya adulto: no aparece.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `mayoria342-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.dx342.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.dx342.${suffix}@example.com` };
const dentist = { fullName: 'Dora Dentista', email: `dora.dx342.${suffix}@example.com` };
const lastName = `Mora${suffix.slice(0, 6)}`;
const lucia = `Lucía ${lastName}`;
const diego = `Diego ${lastName}`;
const DB_SKIP = 'E2E_DATABASE_URL no definido: no se puede fechar el alta del responsable';
const LIST = 'Pacientes que cumplen la mayoría de edad';
const BANNER = /^Cumplió 18 años el .+: revisa a quién van sus avisos y recibos$/;

let session: ApiSession;
let luciaId: string;

test.describe.configure({ mode: 'serial' });

/** Nació hoy hace `years` años en la sede (un 29 de febrero pasa al 28: sigue siendo este mes). */
function bornYearsAgoToday(years: number): string {
  const [y, m, d] = sedeDate(new Date(), SEDE_TODAY_TZ).split('-');
  const day = m === '02' && d === '29' ? '28' : d;
  return `${Number(y) - years}-${m}-${day}`;
}

async function reviewStatus(page: Page, patientId: string): Promise<string> {
  const res = await page.request.get(`${API_URL}/patients/${patientId}/majority-review`, { headers: session.headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { status: string }).status;
}

test.beforeAll(async ({ request }) => {
  if (!E2E_DATABASE_URL) return;
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Mayoría ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
    location: E2E_TODAY_REGION,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });

  ({ id: luciaId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Lucía',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `ML342${suffix}`.slice(0, 20),
    sex: 'F',
    birthDate: bornYearsAgoToday(18),
    email: `lucia.dx342.${suffix}@example.com`,
  }));
  const mother = await apiPost<{ id: string }>(request, session, `/patients/${luciaId}/responsible-parties`, {
    fullName: `Marta ${lastName}`,
    email: `marta.dx342.${suffix}@example.com`,
    relationship: 'MOTHER',
    isPayer: true,
    receivesNotices: true,
  });
  // Dada de alta hace más de un año: cuando Lucía tenía 17.
  backdateResponsibleParty(mother.id, 400);

  const { id: diegoId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Diego',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `MD342${suffix}`.slice(0, 20),
    sex: 'M',
    birthDate: bornYearsAgoToday(30),
  });
  await apiPost(request, session, `/patients/${diegoId}/responsible-parties`, {
    fullName: `Elena ${lastName}`,
    email: `elena.dx342.${suffix}@example.com`,
    relationship: 'SPOUSE',
    isPayer: true,
    receivesNotices: true,
  });
});

test('DENTIST ve el aviso de la ficha sin «Revisar responsables»', async ({ page }) => {
  test.skip(!E2E_DATABASE_URL, DB_SKIP);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/patients/${luciaId}`);
  const banner = page.getByTestId('majority-review-banner');
  await expect(banner.getByRole('heading', { name: BANNER })).toBeVisible({ timeout: 15_000 });
  await expect(banner.getByRole('button', { name: 'Revisar responsables' })).toHaveCount(0);
  // DENTIST no ve el enlace a la lista.
  await page.goto(`${origin}/patients`);
  await expect(page.getByRole('heading', { level: 1, name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Cumplen la mayoría de edad' })).toHaveCount(0);
});

test('RECEPTION revisa desde la lista con «El paciente gestiona sus avisos» y el aviso desaparece', async ({ page }) => {
  test.skip(!E2E_DATABASE_URL, DB_SKIP);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);

  await page.goto(`${origin}/patients`);
  await page.getByRole('link', { name: 'Cumplen la mayoría de edad' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cumplen la mayoría de edad' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('radio', { name: 'Este mes' })).toBeChecked();

  const list = dataList(page, LIST);
  const row = dataListRows(list).filter({ hasText: lucia });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Pendiente');
  await expect(row).toContainText('1 responsable');
  await expect(dataListRows(list).filter({ hasText: diego })).toHaveCount(0);

  await rowAction(page, row, 'Revisar');
  const dialog = page.getByRole('dialog', { name: 'Revisar a quién van sus avisos' });
  await expectDialogInsideViewport(page, dialog);
  await expect(dialog.getByRole('list', { name: 'Responsables del paciente' })).toContainText(`Marta ${lastName} · Madre`);
  await dialog.getByRole('radio', { name: 'El paciente gestiona sus avisos' }).check();
  await dialog.getByLabel('Nota (opcional)').fill('Lo habló con su madre en el mostrador.');
  await dialog.getByRole('button', { name: 'Guardar revisión' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(`Revisión guardada: ${lucia}.`)).toBeVisible();
  await expect(row).toContainText('Revisado', { timeout: 10_000 });
  expect(await reviewStatus(page, luciaId)).toBe('REVIEWED');

  await page.goto(`${origin}/patients/${luciaId}`);
  await expect(page.getByRole('region', { name: 'Responsable y familia' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('majority-review-banner')).toHaveCount(0);
});

test('390 px: la lista y el modal no desbordan y la acción mide 44 px', async ({ page }) => {
  test.skip(!E2E_DATABASE_URL, DB_SKIP);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients/mayoria-de-edad`);
  const list = page.getByRole('list', { name: LIST });
  const row = dataListRows(list).filter({ hasText: lucia });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);

  await rowAction(page, row, 'Revisar');
  const dialog = page.getByRole('dialog', { name: 'Revisar a quién van sus avisos' });
  await expectDialogInsideViewport(page, dialog);
  await expect(dialog.getByRole('radio', { name: 'Mantener al responsable como destino' })).toBeVisible();
  await expectTouchTarget(dialog.getByRole('button', { name: 'Guardar revisión' }), { scope: dialog });
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});
